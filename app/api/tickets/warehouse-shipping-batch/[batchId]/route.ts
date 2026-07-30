import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, TicketActionType, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { sumDeviceQuantity } from "@/lib/device-quantity"

// POST /api/tickets/warehouse-shipping-batch/[batchId]
// 仓库管理员完成批次发货（发回客户或入库）
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  try {
    const body = await request.json()
    const { shippingType, returnDate, returnQuantity } = body
    let { returnTrackingNum } = body
    
    // 清理快递单号中的空格（防呆处理）
    if (returnTrackingNum && typeof returnTrackingNum === 'string') {
      returnTrackingNum = returnTrackingNum.replace(/\s+/g, '')
    }

    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次号不能为空" },
        { status: 400 }
      )
    }

    if (!shippingType || (shippingType !== "return" && shippingType !== "stock")) {
      return NextResponse.json(
        { success: false, message: "发货方式不正确" },
        { status: 400 }
      )
    }

    // 如果是发回客户，必须填写快递信息
    if (shippingType === "return") {
      if (!returnDate || !returnTrackingNum || !returnQuantity) {
        return NextResponse.json(
          { success: false, message: "发回客户必须填写发货日期、快递单号和发货数量" },
          { status: 400 }
        )
      }
    }

    // 验证用户权限
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()

    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName, Username
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userRole = userResult.recordset[0].Role || ""
    const isWarehouse = userRole.toLowerCase().includes("warehouse") || userRole === "仓库管理员" || userRole === "仓库"

    if (!isWarehouse) {
      return NextResponse.json(
        { success: false, message: "只有仓库管理员可以处理发货" },
        { status: 403 }
      )
    }

    // 查询批次中的所有设备
    const devicesResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}, ${DB_FIELDS.QUANTITY} AS quantity
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (devicesResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次工单不存在" },
        { status: 404 }
      )
    }
    const deviceCount = sumDeviceQuantity(devicesResult.recordset)

    // 更新批次中所有设备的发货信息和状态
    const updatePromises = devicesResult.recordset.map(async (device: any) => {
      const updateData: any = {
        status: TicketStatus.COMPLETED,
        shippingType: shippingType,
        updatedAt: new Date(),
        warehouseShippedBy: userResult.recordset[0].RealName || userResult.recordset[0].Username
      }

      if (shippingType === "return") {
        updateData.returnDate = new Date(returnDate)
        updateData.returnTrackingNum = returnTrackingNum
        updateData.returnQuantity = returnQuantity
      }

      return pool
        .request()
        .input("ticketId", device[DB_FIELDS.ID] || device.ID)
        .input("newStatus", TicketStatus.COMPLETED)
        .input("updatedAt", new Date())
        .input("returnDate", shippingType === "return" ? new Date(returnDate) : null)
        .input("returnTrackingNum", shippingType === "return" ? returnTrackingNum : null)
        .input("returnQuantity", shippingType === "return" ? returnQuantity : null)
        .input("shippingType", shippingType)
        .query(`
          UPDATE Repair_Tickets
          SET 
            ${DB_FIELDS.STATUS} = @newStatus,
            ${DB_FIELDS.UPDATED_AT} = @updatedAt,
            ${DB_FIELDS.RETURN_DATE} = @returnDate,
            ${DB_FIELDS.RETURN_TRACKING_NUM} = @returnTrackingNum,
            ${DB_FIELDS.RETURN_QUANTITY} = @returnQuantity,
            ShippingType = @shippingType,
            WarehouseShippedAt = GETUTCDATE(),
            WarehouseShippedBy = '${userResult.recordset[0].RealName || userResult.recordset[0].Username}'
          WHERE ${DB_FIELDS.ID} = @ticketId
        `)
    })

    await Promise.all(updatePromises)

    // 写入操作记录（仅写一条批次级别的记录）
    try {
      const operatorName = userResult.recordset[0].RealName || userResult.recordset[0].Username || "仓库管理员"
      const shippingDesc = shippingType === "return"
        ? `发回客户（快递单号：${returnTrackingNum || "无"}，数量：${returnQuantity || deviceCount} 台）`
        : `产品入库存储`

      // OperatorId 必须是合法整数，否则 SQL Server INT 列报错导致日志丢失
      const operatorIdNum = parseInt(userIdCookie, 10)
      const safeOperatorId = isNaN(operatorIdNum) ? null : operatorIdNum

      const histReq = pool
        .request()
        .input("batchId", batchId)
        .input("actionType", TicketActionType.WAREHOUSE_SHIPPED)
        .input("operatorName", operatorName)
        .input("description", `仓库发货完成，${shippingDesc}，共 ${deviceCount} 台设备`)
        .input("createdAt", new Date())

      if (safeOperatorId !== null) histReq.input("operatorId", safeOperatorId)

      const insertSql = safeOperatorId !== null
        ? `INSERT INTO Repair_Ticket_History (BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt)
           VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, @createdAt)`
        : `INSERT INTO Repair_Ticket_History (BatchId, ActionType, OperatorName, Description, CreatedAt)
           VALUES (@batchId, @actionType, @operatorName, @description, @createdAt)`

      await histReq.query(insertSql)
      console.log(`✅ [Warehouse Shipping] 操作记录已写入 Repair_Ticket_History`)
    } catch (historyErr: unknown) {
      const msg = historyErr instanceof Error ? historyErr.message : "未知错误"
      console.error(`❌ [Warehouse Shipping] 写入操作记录失败（非致命）: ${msg}`)
    }

    return NextResponse.json({
      success: true,
      message: shippingType === "return" 
        ? `批次设备已发回客户，共 ${deviceCount} 台`
        : `批次设备已入库，共 ${deviceCount} 台`,
      data: {
        batchId,
        deviceCount,
        shippingType
      }
    })

  } catch (error: any) {
    console.error("仓库发货失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || "仓库发货失败" 
      },
      { status: 500 }
    )
  }
}
