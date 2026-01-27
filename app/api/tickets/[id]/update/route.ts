import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"

// PUT /api/tickets/[id]/update
// 更新维修工单状态
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      status,
      deleteToRecycleBin,
      id: bodyId,
      // 新增：延期相关字段
      action,
      delayTo,
      delayReason,
      // 新增：补录 SN 相关字段
      supplementSN,
      newSerialNumber,
      // 新增：取消申请相关字段
      cancelRequestReason,
      scrappedReason,
      cancelReason,
    } = body ?? {}

    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params

    const ticketId = resolvedParams?.id || bodyId

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "工单ID不能为空" },
        { status: 400 }
      )
    }

    const isDelayAction = action === "delay"
    const isSupplementSNAction = action === "supplementSN" || supplementSN === true
    const isCancelRequestAction = action === "request_cancel"
    const isApproveCancelAction = action === "approve_cancel"
    const isRejectCancelAction = action === "reject_cancel"

    // 基于登录用户进行权限校验：只有维修工程师(Technician)、管理员(Admin)、商务人员(Business)或仓库管理员(Warehouse)才能更新工单
    let isWarehouseOnlyUpdate = false
    let isTechnician = false
    let isAdmin = false
    let isBusiness = false
    let isWarehouse = false
    let userRole = "" // 用户角色（原始值）
    let userRealName = "" // 用户真实姓名
    let userUsername = "" // 用户名

    try {
      const cookieStore = await cookies()
      const userIdCookie = cookieStore.get("userId")?.value || null
      if (!userIdCookie) {
        return NextResponse.json(
          { success: false, message: "未登录，无法更新工单" },
          { status: 401 }
        )
      }

      const poolForUser = await getDbConnection()
      const userResult = await poolForUser
        .request()
        .input("userId", userIdCookie)
        .query(`
          SELECT TOP 1 Role, RealName, Username
          FROM Users
          WHERE UserID = @userId
        `)

      if (userResult.recordset.length === 0) {
        return NextResponse.json(
          { success: false, message: "用户不存在，无法更新工单" },
          { status: 403 }
        )
      }

      const userData = userResult.recordset[0]
      const role = (userData.Role || "").toString().toLowerCase()
      userRole = userData.Role || "" // 保存原始角色值用于后续检查
      userRealName = userData.RealName || "" // 用户真实姓名
      userUsername = userData.Username || "" // 用户名
      isTechnician = role === "technician"
      isAdmin = role === "admin"
      isBusiness = role === "business" || role === "商务" || role === "商务人员" || role === "商务管理员"
      isWarehouse = role === "warehouse" || role === "warehouse_manager" || role === "warehousemanager" || role === "warehouse_admin" || role === "warehouseadmin"

      // 检查是否是仓库管理员只更新仓库相关字段的情况
      const warehouseFields = ["receiveddate", "factoryshipdate", "returndate", "returnquantity", "returntrackingnum"]
      const bodyKeys = Object.keys(body).map(k => k.toLowerCase())
      const hasWarehouseFields = bodyKeys.some(key => warehouseFields.includes(key))
      const hasOtherFields = bodyKeys.some(key => 
        !warehouseFields.includes(key) && 
        key !== "status" && 
        key !== "deletetorecyclebin" && 
        key !== "action" && 
        key !== "delayto" && 
        key !== "delayreason" && 
        key !== "supplementsn" && 
        key !== "newserialnumber"
      )
      
      isWarehouseOnlyUpdate = hasWarehouseFields && !hasOtherFields && 
                                     !status && !deleteToRecycleBin && !isDelayAction && !isSupplementSNAction

      // 权限检查：仓库管理员可以更新仓库字段，维修工程师和管理员可以更新其他字段
      if (isWarehouse) {
        // 仓库管理员
        if (isWarehouseOnlyUpdate) {
          // 仓库管理员只更新仓库字段，允许
        } else if (hasOtherFields) {
          // 仓库管理员尝试更新非仓库字段，拒绝
          return NextResponse.json(
            { success: false, message: "仓库管理员只能更新仓库相关字段（收到日期、出厂日期、返还日期、返还数量、快递单号）" },
            { status: 403 }
          )
        } else {
          // 仓库管理员但没有更新仓库字段，可能是空请求或其他情况
          return NextResponse.json(
            { success: false, message: "请至少更新一个仓库相关字段" },
            { status: 400 }
          )
        }
      } else if (!isTechnician && !isAdmin && !isBusiness) {
        // 既不是仓库管理员，也不是维修工程师、管理员或商务人员
        // 但是如果是取消申请操作，现场人员也可以执行
        if (!isCancelRequestAction) {
          return NextResponse.json(
            { success: false, message: "只有维修工程师、管理员、商务人员或仓库管理员可以更新工单" },
            { status: 403 }
          )
        }
      }

      // 如果是取消申请操作，要求必须是现场人员（Reporter）
      if (isCancelRequestAction) {
        const userRoleLower = (userRole || "").toLowerCase()
        if (userRoleLower !== "reporter" && userRoleLower !== "现场人员" && userRoleLower !== "现场报告人员") {
          return NextResponse.json(
            { success: false, message: "只有现场人员可以申请取消工单" },
            { status: 403 }
          )
        }
      }

      // 如果是延期操作，进一步要求必须是维修工程师（可根据需要保留管理员权限）
      if (isDelayAction && !isTechnician) {
        return NextResponse.json(
          { success: false, message: "只有维修工程师可以申请延期" },
          { status: 403 }
        )
      }
      
      // 如果是审批取消申请操作，要求必须是管理员或商务人员
      if ((isApproveCancelAction || isRejectCancelAction) && !isAdmin && !isBusiness) {
        return NextResponse.json(
          { success: false, message: "只有管理员或商务人员可以审批取消申请" },
          { status: 403 }
        )
      }
    } catch (authError: any) {
      console.error("工单更新权限校验失败:", authError?.message)
      return NextResponse.json(
        { success: false, message: "工单更新权限校验失败", error: authError?.message || "未知错误" },
        { status: 500 }
      )
    }

    // 如果是"回收站删除"或"补录 SN"操作，可以不传业务状态
    // 如果是仓库管理员只更新仓库字段，也可以不传状态
    if (!status && !deleteToRecycleBin && !isDelayAction && !isSupplementSNAction && !isWarehouseOnlyUpdate && !isCancelRequestAction && !isApproveCancelAction && !isRejectCancelAction) {
      return NextResponse.json(
        { success: false, message: "状态不能为空" },
        { status: 400 }
      )
    }

    // 支持的业务状态 + 回收站状态 + 延期状态 + 返厂状态 + 终止状态
    // 新状态流转：Created (待维修) -> In_Repair (维修中) -> Admin_Review (待商务处理) -> Pending_Shipment (待发货) -> Completed (已完成)
    // 返厂流转：In_Repair -> Pending_Factory (待返厂) -> Factory_Finished (原厂修回) -> Admin_Review -> ...
    // 终止状态：Scrapped (已报废)、Return_Unrepaired (拒修退回)、Cancelled (已取消)
    const validStatuses = [
      "Created", "Pending", // 待维修（兼容旧状态）
      "In_Repair", "Processing", // 维修中（兼容旧状态）
      "Pending_Factory", // 待返厂/返厂中
      "Factory_Finished", // 原厂修回/待复检
      "Admin_Review", // 待商务处理
      "Pending_Shipment", // 待发货
      "Completed", // 已完成
      "Unrepairable", // 无法维修
      "Deleted", // 已删除
      "Delayed", // 已延期
      "Scrapped", // 已报废
      "Return_Unrepaired", // 拒修退回
      "Cancelled", // 已取消
    ]
    const statusMap: Record<string, string> = {
      // 新状态
      "created": "Created",
      "in_repair": "In_Repair",
      "pending_factory": "Pending_Factory",
      "factory_finished": "Factory_Finished",
      "admin_review": "Admin_Review",
      "pending_shipment": "Pending_Shipment",
      // 旧状态（向后兼容）
      "pending": "Created", // 映射到新状态
      "processing": "In_Repair", // 映射到新状态
      "completed": "Completed",
      "unrepairable": "Unrepairable",
      "deleted": "Deleted",
      "delayed": "Delayed",
      // 终止状态
      "scrapped": "Scrapped",
      "return_unrepaired": "Return_Unrepaired",
      "cancelled": "Cancelled",
    }

    // 如果是回收站删除操作，则强制使用 Deleted 状态
    const targetStatus = deleteToRecycleBin ? "deleted" : isDelayAction ? "delayed" : status

    // 如果是取消申请操作或审批取消申请操作，先处理这些操作（不需要状态验证）
    // 这些操作会在处理完成后直接返回，不会执行到后面的状态验证逻辑
    
    const pool = await getDbConnection()

    // 动态获取 Repair_Tickets 表的列名，避免大小写或命名不一致导致错误
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const columnNames = columnsResult.recordset.map((row: any) => row.COLUMN_NAME as string)

    // 优先使用主键列，其次使用名字中包含 "id" 的列，最后退回第一列
    const pkResult = await pool.request().query(`
      SELECT kcu.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = 'Repair_Tickets' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    `)

    let idColumn: string
    if (pkResult.recordset.length > 0) {
      idColumn = pkResult.recordset[0].COLUMN_NAME as string
    } else {
      idColumn =
        columnNames.find((c) => c.toLowerCase().endsWith("id")) ||
        columnNames.find((c) => c.toLowerCase().includes("id")) ||
        columnNames[0]
    }

    const deviceSnColumn =
      columnNames.find((c) => c.toLowerCase() === "devicesn") ||
      columnNames.find((c) => c.toLowerCase().includes("serial")) ||
      "DeviceSN"
    const productSnColumn =
      columnNames.find((c) => c.toLowerCase() === "productsn") || "ProductSN"
    const hasProductSn = columnNames.some((c) => c.toLowerCase() === "productsn")

    // 检查工单是否存在，并获取设备序列号和取消申请状态
    const cancelRequestStatusCol = columnNames.find((c) => c.toLowerCase() === "cancelrequeststatus")
    const cancelRequestStatusSelect = cancelRequestStatusCol ? `, ${cancelRequestStatusCol} as CancelRequestStatus` : ""
    
    const checkResult = await pool
      .request()
      .input("ticketId", ticketId)
      .query(`
        SELECT ${idColumn} as Id, ${deviceSnColumn} as DeviceSN, ${hasProductSn ? `${productSnColumn} as ProductSN,` : ""} Status${cancelRequestStatusSelect}
        FROM Repair_Tickets
        WHERE ${idColumn} = @ticketId
      `)

    if (checkResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      )
    }

    const ticket = checkResult.recordset[0] as { Id: number; DeviceSN: string; ProductSN?: string; Status?: string; CancelRequestStatus?: string }

    // 如果是补录 SN 操作，验证新序列号
    if (isSupplementSNAction) {
      if (!newSerialNumber || !newSerialNumber.trim()) {
        return NextResponse.json(
          { success: false, message: "新序列号不能为空" },
          { status: 400 }
        )
      }

      const sn = newSerialNumber.trim()

      // 验证序列号是否存在于 Device_Inventory
      try {
        const deviceCheckResult = await pool
          .request()
          .input("serialNumber", sn)
          .query(`
            SELECT TOP 1 SerialNumber, ModelName, DeviceName, MaterialCode, Warehouse, Status
            FROM Device_Inventory
            WHERE SerialNumber = @serialNumber
          `)

        if (deviceCheckResult.recordset.length === 0) {
          return NextResponse.json(
            { success: false, message: "设备序列号不存在于设备档案中，请先录入设备信息" },
            { status: 400 }
          )
        }

        const device = deviceCheckResult.recordset[0] as {
          SerialNumber: string
          ModelName: string
          DeviceName: string | null
          MaterialCode: string | null
          Warehouse: string | null
          Status: string | null
        }

        // 更新工单的 DeviceSN 和 ProductSN
        const updateColumns: string[] = []
        const updateValues: string[] = []

        updateColumns.push(`${deviceSnColumn} = @newDeviceSN`)
        updateValues.push("@newDeviceSN")
        if (hasProductSn) {
          updateColumns.push(`${productSnColumn} = @newProductSN`)
          updateValues.push("@newProductSN")
        }

        // 如果存在 MaterialCode 和 DeviceName 字段，也更新它们
        const materialCodeColumn = columnNames.find((c) => c.toLowerCase() === "materialcode")
        const deviceNameColumn = columnNames.find((c) => c.toLowerCase() === "devicename")
        const warehouseColumn = columnNames.find((c) => c.toLowerCase() === "warehouse")

        if (materialCodeColumn && device.MaterialCode) {
          updateColumns.push(`${materialCodeColumn} = @materialCode`)
          updateValues.push("@materialCode")
        }
        if (deviceNameColumn && device.DeviceName) {
          updateColumns.push(`${deviceNameColumn} = @deviceName`)
          updateValues.push("@deviceName")
        }
        if (warehouseColumn && device.Warehouse) {
          updateColumns.push(`${warehouseColumn} = @warehouse`)
          updateValues.push("@warehouse")
        }

        const updateRequest = pool.request()
          .input("ticketId", ticketId)
          .input("newDeviceSN", sn)
          .input("newProductSN", sn)

        if (materialCodeColumn && device.MaterialCode) {
          updateRequest.input("materialCode", device.MaterialCode)
        }
        if (deviceNameColumn && device.DeviceName) {
          updateRequest.input("deviceName", device.DeviceName)
        }
        if (warehouseColumn && device.Warehouse) {
          updateRequest.input("warehouse", device.Warehouse)
        }

        await updateRequest.query(`
          UPDATE Repair_Tickets
          SET ${updateColumns.join(", ")}
          WHERE ${idColumn} = @ticketId
        `)

        // 更新设备状态为"维修中"（如果设备在库或出库）
        const currentDeviceStatus = device.Status || ""
        const isInStock =
          currentDeviceStatus === "在库" ||
          currentDeviceStatus === "In Stock" ||
          currentDeviceStatus.toLowerCase() === "instock"
        const isOutStock =
          currentDeviceStatus === "出库" ||
          currentDeviceStatus === "Out Stock" ||
          currentDeviceStatus.toLowerCase() === "outstock"

        if (isInStock || isOutStock) {
          await pool
            .request()
            .input("serialNumber", sn)
            .input("newStatus", "维修中")
            .query(`
              UPDATE Device_Inventory
              SET Status = @newStatus
              WHERE SerialNumber = @serialNumber
            `)
        }

        // 记录补录 SN 的历史记录
        try {
          const historyRequest = pool
            .request()
            .input("ticketId", ticketId.toString())
            .input("actionType", "SupplementSN")
            .input("oldStatus", ticket.Status || null)
            .input("newStatus", ticket.Status || null)
            .input("delayTo", null)
            .input("delayReason", `补录序列号: ${sn}`)

          await historyRequest.query(`
            IF OBJECT_ID('dbo.Repair_Ticket_History', 'U') IS NOT NULL
            BEGIN
              INSERT INTO [dbo].[Repair_Ticket_History] (
                TicketID, ActionType, OldStatus, NewStatus, DelayTo, DelayReason
              )
              VALUES (
                @ticketId, @actionType, @oldStatus, @newStatus, @delayTo, @delayReason
              )
            END
          `)
        } catch (historyError: any) {
          console.error("记录补录 SN 历史失败:", historyError?.message)
        }

        return NextResponse.json({
          success: true,
          message: "序列号补录成功",
        })
      } catch (deviceError: any) {
        console.error("补录 SN 验证失败:", deviceError?.message)
        return NextResponse.json(
          {
            success: false,
            message: "验证设备序列号失败",
            error: deviceError?.message || "未知错误",
          },
          { status: 500 }
        )
      }
    }

    // 如果是延期操作，仅允许在维修中状态下申请
    if (isDelayAction) {
      const currentStatus = (ticket.Status || "").toString()
      if (currentStatus !== "In_Repair" && currentStatus !== "Processing") {
        return NextResponse.json(
          { success: false, message: "只有\"维修中\"的工单才能申请延期" },
          { status: 400 }
        )
      }
    }
    
    // 如果是取消申请操作
    if (isCancelRequestAction) {
      const currentStatus = (ticket.Status || "").toString()
      // 已取消或已完成的工单不能申请取消
      if (currentStatus === "Cancelled" || currentStatus === "Completed") {
        return NextResponse.json(
          { success: false, message: "已取消或已完成的工单不能申请取消" },
          { status: 400 }
        )
      }
      
      // 检查是否已有待审批的取消申请
      const cancelRequestStatusColumn = columnNames.find((c) => c.toLowerCase() === "cancelrequeststatus")
      if (cancelRequestStatusColumn) {
        const currentCancelRequestStatus = (ticket as any)[cancelRequestStatusColumn]
        if (currentCancelRequestStatus === "Pending") {
          return NextResponse.json(
            { success: false, message: "已有待审批的取消申请，请等待审批结果" },
            { status: 400 }
          )
        }
      }
      
      // 更新取消申请相关字段
      const cancelRequestStatusCol = columnNames.find((c) => c.toLowerCase() === "cancelrequeststatus")
      const cancelRequestReasonCol = columnNames.find((c) => c.toLowerCase() === "cancelrequestreason")
      const cancelRequestDateCol = columnNames.find((c) => c.toLowerCase() === "cancelrequestdate")
      
      const cancelUpdateFields: string[] = []
      const cancelUpdateRequest = pool.request().input("ticketId", ticketId)
      
      if (cancelRequestStatusCol) {
        cancelUpdateFields.push(`${cancelRequestStatusCol} = 'Pending'`)
      }
      if (cancelRequestReasonCol && cancelRequestReason) {
        cancelUpdateFields.push(`${cancelRequestReasonCol} = @cancelRequestReason`)
        cancelUpdateRequest.input("cancelRequestReason", cancelRequestReason)
      }
      if (cancelRequestDateCol) {
        cancelUpdateFields.push(`${cancelRequestDateCol} = GETDATE()`)
      }
      
      if (cancelUpdateFields.length > 0) {
        await cancelUpdateRequest.query(`
          UPDATE Repair_Tickets
          SET ${cancelUpdateFields.join(", ")}
          WHERE ${idColumn} = @ticketId
        `)
      }
      
      // 记录历史
      try {
        await pool.request()
          .input("ticketId", ticketId.toString())
          .input("actionType", "CancelRequest")
          .input("oldStatus", ticket.Status || null)
          .input("newStatus", ticket.Status || null)
          .query(`
            INSERT INTO Repair_Ticket_History (TicketID, ActionType, OldStatus, NewStatus, CreatedAt)
            VALUES (@ticketId, @actionType, @oldStatus, @newStatus, GETDATE())
          `)
      } catch (historyError: any) {
        console.error("记录取消申请历史失败:", historyError?.message)
      }
      
      return NextResponse.json({
        success: true,
        message: "取消申请已提交，等待商务人员审批",
      })
    }
    
    // 如果是审批取消申请操作
    if (isApproveCancelAction || isRejectCancelAction) {
      const cancelRequestStatusCol = columnNames.find((c) => c.toLowerCase() === "cancelrequeststatus")
      const cancelApprovedByCol = columnNames.find((c) => c.toLowerCase() === "cancelapprovedby")
      const cancelApprovedDateCol = columnNames.find((c) => c.toLowerCase() === "cancelapproveddate")
      
      // 检查是否有待审批的取消申请
      if (cancelRequestStatusCol) {
        // 优先使用从查询中获取的 CancelRequestStatus 字段
        const currentCancelRequestStatus = ticket.CancelRequestStatus || (ticket as any)[cancelRequestStatusCol] || null
        const statusStr = (currentCancelRequestStatus || "").toString().trim()
        // 支持大小写不敏感的匹配
        if (statusStr.toLowerCase() !== "pending") {
          return NextResponse.json(
            { success: false, message: `没有待审批的取消申请（当前状态: ${statusStr || "无"}）` },
            { status: 400 }
          )
        }
      } else {
        // 如果字段不存在，也返回错误
        return NextResponse.json(
          { success: false, message: "系统未配置取消申请功能" },
          { status: 400 }
        )
      }
      
      const approveUpdateFields: string[] = []
      const approveUpdateRequest = pool.request().input("ticketId", ticketId)
      
      if (cancelRequestStatusCol) {
        approveUpdateFields.push(`${cancelRequestStatusCol} = @cancelRequestStatus`)
        approveUpdateRequest.input("cancelRequestStatus", isApproveCancelAction ? "Approved" : "Rejected")
      }
      if (cancelApprovedByCol) {
        approveUpdateFields.push(`${cancelApprovedByCol} = @cancelApprovedBy`)
        approveUpdateRequest.input("cancelApprovedBy", userRealName || userUsername || "")
      }
      if (cancelApprovedDateCol) {
        approveUpdateFields.push(`${cancelApprovedDateCol} = GETDATE()`)
      }
      
      // 如果审批通过，更新工单状态为 Cancelled
      if (isApproveCancelAction) {
        approveUpdateFields.push(`Status = 'Cancelled'`)
      }
      
      if (approveUpdateFields.length > 0) {
        await approveUpdateRequest.query(`
          UPDATE Repair_Tickets
          SET ${approveUpdateFields.join(", ")}
          WHERE ${idColumn} = @ticketId
        `)
      }
      
      // 记录历史
      try {
        await pool.request()
          .input("ticketId", ticketId.toString())
          .input("actionType", isApproveCancelAction ? "CancelApproved" : "CancelRejected")
          .input("oldStatus", ticket.Status || null)
          .input("newStatus", isApproveCancelAction ? "Cancelled" : ticket.Status || null)
          .query(`
            INSERT INTO Repair_Ticket_History (TicketID, ActionType, OldStatus, NewStatus, CreatedAt)
            VALUES (@ticketId, @actionType, @oldStatus, @newStatus, GETDATE())
          `)
      } catch (historyError: any) {
        console.error("记录审批历史失败:", historyError?.message)
      }
      
      return NextResponse.json({
        success: true,
        message: isApproveCancelAction ? "取消申请已通过，工单已取消" : "取消申请已拒绝",
      })
    }

    // 构建更新字段列表
    const updateFields: string[] = []
    const updateRequest = pool.request().input("ticketId", ticketId)

    // 如果仓库管理员只更新仓库字段，不更新状态（除非填写了快递单号）
    if (isWarehouseOnlyUpdate && isWarehouse) {
      // 只更新仓库相关字段
      const receivedDateColumn = columnNames.find((c) => c.toLowerCase() === "receiveddate")
      const factoryShipDateColumn = columnNames.find((c) => c.toLowerCase() === "factoryshipdate")
      const returnDateColumn = columnNames.find((c) => c.toLowerCase() === "returndate")
      const returnQuantityColumn = columnNames.find((c) => c.toLowerCase() === "returnquantity")
      const returnTrackingNumColumn = columnNames.find((c) => c.toLowerCase() === "returntrackingnum")

      if (body.receivedDate && receivedDateColumn) {
        updateFields.push(`${receivedDateColumn} = @receivedDate`)
        updateRequest.input("receivedDate", new Date(body.receivedDate))
      }
      if (body.factoryShipDate && factoryShipDateColumn) {
        updateFields.push(`${factoryShipDateColumn} = @factoryShipDate`)
        updateRequest.input("factoryShipDate", new Date(body.factoryShipDate))
      }
      if (body.returnDate && returnDateColumn) {
        updateFields.push(`${returnDateColumn} = @returnDate`)
        updateRequest.input("returnDate", new Date(body.returnDate))
      }
      if (body.returnQuantity !== undefined && returnQuantityColumn) {
        updateFields.push(`${returnQuantityColumn} = @returnQuantity`)
        updateRequest.input("returnQuantity", body.returnQuantity)
      }
      if (body.returnTrackingNum !== undefined && returnTrackingNumColumn) {
        updateFields.push(`${returnTrackingNumColumn} = @returnTrackingNum`)
        updateRequest.input("returnTrackingNum", body.returnTrackingNum || null)
        
        // 规则：仓库管理员填完 ReturnTrackingNum 时，自动转为已完成
        if (body.returnTrackingNum && body.returnTrackingNum.trim()) {
          updateFields.push(`Status = @status`)
          updateRequest.input("status", "Completed")
        }
      }

      if (updateFields.length > 0) {
        await updateRequest.query(`
          UPDATE Repair_Tickets
          SET ${updateFields.join(", ")}
          WHERE ${idColumn} = @ticketId
        `)
      }
    } else if (!isCancelRequestAction && !isApproveCancelAction && !isRejectCancelAction) {
      // 更新工单状态（维修工程师或管理员的操作）
      // 取消申请和审批取消申请操作不在这里更新状态
      if (dbStatus) {
        await pool
          .request()
          .input("ticketId", ticketId)
          .input("status", dbStatus)
          .query(`
            UPDATE Repair_Tickets
            SET Status = @status
            WHERE ${idColumn} = @ticketId
          `)
      }
    }

    // 如果工单状态为"已完成"或"无法维修"，将设备状态更新为"在库"（设备返回入库）
    // 兼容旧状态 Processing
    // 取消申请和审批取消申请操作不更新设备状态
    if (dbStatus && (dbStatus === "Completed" || dbStatus === "Unrepairable") && !isCancelRequestAction && !isApproveCancelAction && !isRejectCancelAction) {
      try {
        await pool
          .request()
          .input("deviceSn", ticket.DeviceSN)
          .input("newStatus", "在库")
          .query(`
            UPDATE Device_Inventory
            SET Status = @newStatus
            WHERE SerialNumber = @deviceSn
          `)
        console.log(`工单 ${ticketId} 完成，设备 ${ticket.DeviceSN} 状态已更新为：在库`)
      } catch (deviceError: any) {
        // 设备状态更新失败不影响工单状态更新，只记录日志
        console.error(`更新设备状态失败（工单 ${ticketId}）:`, deviceError?.message)
      }
    }

    // 如果历史表不存在，则创建（延期或状态变更都会用到）
    try {
      await pool.request().query(`
        IF NOT EXISTS (
          SELECT * FROM sys.objects 
          WHERE object_id = OBJECT_ID(N'[dbo].[Repair_Ticket_History]') 
            AND type in (N'U')
        )
        BEGIN
          CREATE TABLE [dbo].[Repair_Ticket_History] (
            [Id] INT IDENTITY(1,1) PRIMARY KEY,
            [TicketID] NVARCHAR(50) NOT NULL,
            [ActionType] NVARCHAR(50) NOT NULL,
            [OldStatus] NVARCHAR(50) NULL,
            [NewStatus] NVARCHAR(50) NULL,
            [DelayTo] DATETIME NULL,
            [DelayReason] NVARCHAR(500) NULL,
            [CreatedAt] DATETIME NOT NULL DEFAULT(GETDATE())
          )
        END
      `)
    } catch (createHistoryError: any) {
      console.error("创建 Repair_Ticket_History 表失败:", createHistoryError?.message)
      // 表创建失败不会阻止主流程
    }

    // 如果是延期操作，记录延期历史
    if (isDelayAction) {
      try {
        const historyRequest = pool
          .request()
          .input("ticketId", ticketId.toString())
          .input("actionType", "Delay")
          .input("oldStatus", ticket.Status || null)
          .input("newStatus", dbStatus)
          .input("delayTo", delayTo ? new Date(delayTo) : null)
          .input("delayReason", delayReason || null)

        await historyRequest.query(`
          INSERT INTO [dbo].[Repair_Ticket_History] (
            TicketID, ActionType, OldStatus, NewStatus, DelayTo, DelayReason
          )
          VALUES (
            @ticketId, @actionType, @oldStatus, @newStatus, @delayTo, @delayReason
          )
        `)
      } catch (historyError: any) {
        // 延期历史记录失败不影响主工单状态
        console.error("记录延期历史失败:", historyError?.message)
      }
    } else {
      // 普通状态变更历史
      try {
        const historyRequest = pool
          .request()
          .input("ticketId", ticketId.toString())
          .input("actionType", "StatusChange")
          .input("oldStatus", ticket.Status || null)
          .input("newStatus", dbStatus)
          .input("delayTo", null)
          .input("delayReason", null)

        await historyRequest.query(`
          INSERT INTO [dbo].[Repair_Ticket_History] (
            TicketID, ActionType, OldStatus, NewStatus, DelayTo, DelayReason
          )
          VALUES (
            @ticketId, @actionType, @oldStatus, @newStatus, @delayTo, @delayReason
          )
        `)
      } catch (statusHistoryError: any) {
        console.error("记录状态变更历史失败:", statusHistoryError?.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: isDelayAction ? "延期申请已提交" : isSupplementSNAction ? "序列号补录成功" : "工单状态更新成功",
    })
  } catch (error: any) {
    console.error("更新工单状态失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "更新工单状态时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}
