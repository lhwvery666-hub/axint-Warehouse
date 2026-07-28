import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, UserRole, normalizeUserRole, TicketActionType, normalizeTicketStatus } from "@/lib/enums"
import { getDeviceQuantity, sumDeviceQuantity } from "@/lib/device-quantity"

// POST /api/tickets/warehouse-confirm-batch/[batchId]
// 仓库管理员确认批次设备并填写出厂日期
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  let pool: Awaited<ReturnType<typeof getDbConnection>> | null = null
  let transaction: any | null = null

  try {
    // ==================== 1. 权限校验（第一行，遵守 cursorrules） ====================
    
    const cookieStore = await cookies();
    const userIdCookie = cookieStore.get("userId")?.value || null;
    
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录，无法确认批次" },
        { status: 401 }
      );
    }

    pool = await getDbConnection();

    // 验证用户角色（使用枚举，遵守 cursorrules）
    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 UserID, Role, RealName, Username
        FROM Users
        WHERE UserID = @userId
      `);

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      );
    }

    const currentUser = userResult.recordset[0];
    const normalizedRole = normalizeUserRole(currentUser.Role);

    if (normalizedRole !== UserRole.WAREHOUSE) {
      return NextResponse.json(
        { success: false, message: "只有仓库管理员可以确认批次设备" },
        { status: 403 }
      );
    }

    // ==================== 2. 解析请求参数 ====================

    const body = await request.json();
    const { devices } = body;

    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params;

    const batchId = resolvedParams.batchId;

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次号不能为空" },
        { status: 400 }
      );
    }

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return NextResponse.json(
        { success: false, message: "设备列表不能为空" },
        { status: 400 }
      );
    }

    // 验证所有设备都有出厂日期和到货日期
    const missingManufacture = devices.filter((d: any) => !d.manufactureDate);
    if (missingManufacture.length > 0) {
      return NextResponse.json(
        { success: false, message: `有 ${sumDeviceQuantity(missingManufacture)} 台设备未填写出厂日期` },
        { status: 400 }
      );
    }
    const missingArrival = devices.filter((d: any) => !d.arrivalDate);
    if (missingArrival.length > 0) {
      return NextResponse.json(
        { success: false, message: `有 ${sumDeviceQuantity(missingArrival)} 台设备未填写到货日期` },
        { status: 400 }
      );
    }

    // ==================== 3. 开始数据库事务（遵守 cursorrules） ====================

    transaction = pool.transaction();
    await transaction.begin();

    try {
      const operatorName = currentUser.RealName || currentUser.Username;

      // 3.0 动态检测可选列是否存在（防止列未迁移时整条 UPDATE 失败）
      // 同时自动迁移 ArrivalDate 列（到货日期）
      await transaction.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'ArrivalDate'
        )
          ALTER TABLE Repair_Tickets ADD ArrivalDate DATETIME NULL;
      `)

      const columnCheckResult = await transaction.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Repair_Tickets'
          AND COLUMN_NAME IN ('WarehouseConfirmedAt', 'WarehouseConfirmedBy', 'UpdatedAt', 'ManufactureDate', 'ArrivalDate')
      `)
      const existingColumns = new Set<string>(
        columnCheckResult.recordset.map((r: { COLUMN_NAME: string }) => r.COLUMN_NAME)
      )
      const hasWarehouseConfirmedAt = existingColumns.has('WarehouseConfirmedAt')
      const hasWarehouseConfirmedBy = existingColumns.has('WarehouseConfirmedBy')
      const hasUpdatedAt = existingColumns.has('UpdatedAt')
      const hasManufactureDate = existingColumns.has('ManufactureDate')
      const hasArrivalDate = existingColumns.has('ArrivalDate')
      console.log('[Warehouse Confirm] 可选列检测结果:', {
        hasWarehouseConfirmedAt, hasWarehouseConfirmedBy, hasUpdatedAt, hasManufactureDate
      })

      // 3.1 更新批次中所有设备的出厂日期和工单状态
      // ⚠️ 状态降级守卫：只确认处于 Created / Warehouse_Confirming（含 Warehouse_Confirmed 中间态）状态的设备，跳过已推进的设备
      // ⚠️ 曾经的 bug：这里用原始字符串精确比较（Set.has），一旦数据库里的状态大小写/格式与枚举字面量
      // 不完全一致（如历史脏数据、其他代码路径写入的变体），就会被误判为"已超出可确认范围"而跳过，
      // 导致该设备永远无法被仓库确认，状态卡死在 Warehouse_Confirming。
      // 修复：统一用 normalizeTicketStatus 归一化后再比较，且补充 WAREHOUSE_CONFIRMED 中间态。
      const CONFIRMABLE_STATUSES = new Set<TicketStatus>([
        TicketStatus.CREATED,
        TicketStatus.WAREHOUSE_CONFIRMING,
        TicketStatus.WAREHOUSE_CONFIRMED,
      ])
      // ⚠️ 修复：确认后直接流转到 IN_REPAIR，进入维修环节，而不是停留在 WAREHOUSE_CONFIRMED
      const newStatus = TicketStatus.IN_REPAIR
      let confirmedCount = 0
      let skippedCount = 0
      let isReconfirmation = false // 标记是否为重新确认（从 WAREHOUSE_CONFIRMING 确认）
      const skippedDeviceStatuses: string[] = []
      console.log(`[Warehouse Confirm] 准备处理 ${devices.length} 条设备明细，只更新可确认状态的设备`)
      
      for (const device of devices) {
        // ---- 前置：查询设备当前状态，防止状态降级 ----
        const statusCheckResult = await transaction.request()
          .input("ticketId", Number(device.id))
          .query(`SELECT ${DB_FIELDS.STATUS}, Quantity FROM Repair_Tickets WHERE ${DB_FIELDS.ID} = @ticketId`)
        
        const currentDeviceStatus = statusCheckResult.recordset[0]?.[DB_FIELDS.STATUS] as string | undefined
        const deviceQuantity = getDeviceQuantity({ quantity: statusCheckResult.recordset[0]?.Quantity })
        const normalizedDeviceStatus = normalizeTicketStatus(currentDeviceStatus)
        
        if (!normalizedDeviceStatus || !CONFIRMABLE_STATUSES.has(normalizedDeviceStatus)) {
          console.log(`[Warehouse Confirm] ⏭ 设备 ${device.id} 当前状态 "${currentDeviceStatus}" 已超出可确认范围，跳过以防止降级`)
          skippedCount += deviceQuantity
          skippedDeviceStatuses.push(currentDeviceStatus || "未知")
          continue
        }

        // 判断是否为重新确认（从 WAREHOUSE_CONFIRMING / WAREHOUSE_CONFIRMED 确认）
        if (normalizedDeviceStatus === TicketStatus.WAREHOUSE_CONFIRMING || normalizedDeviceStatus === TicketStatus.WAREHOUSE_CONFIRMED) {
          isReconfirmation = true
        }

        // ---- 第一步：只更新核心字段（Status + ManufactureDate），保证一定成功 ----
        const coreUpdateRequest = transaction.request()
        coreUpdateRequest.input("ticketId", Number(device.id))
        coreUpdateRequest.input("newStatus", newStatus)
        if (hasManufactureDate) {
          coreUpdateRequest.input("manufactureDate", new Date(device.manufactureDate))
        }
        if (hasArrivalDate) {
          // 时区处理：前端传入 ISO 字符串（含 UTC 偏移），直接用 new Date() 解析后传给 SQL Server
          // SQL Server 存储 UTC 时间，前端读取时再格式化为东八区日期显示，保证无偏差
          coreUpdateRequest.input("arrivalDate", new Date(device.arrivalDate))
        }

        const coreSetClauses = [
          `${DB_FIELDS.STATUS} = @newStatus`,
          ...(hasManufactureDate ? [`ManufactureDate = @manufactureDate`] : []),
          ...(hasArrivalDate ? [`ArrivalDate = @arrivalDate`] : []),
        ].join(', ')

        const coreUpdateResult = await coreUpdateRequest.query(`
          UPDATE Repair_Tickets
          SET ${coreSetClauses}
          WHERE ${DB_FIELDS.ID} = @ticketId
        `)

        console.log(`[Warehouse Confirm] 设备 ${device.id} 核心状态更新结果:`, {
          rowsAffected: coreUpdateResult.rowsAffected?.[0] || 0,
          newStatus
        })

        if ((coreUpdateResult.rowsAffected?.[0] || 0) === 0) {
          throw new Error(`设备 ID=${device.id} 的核心状态更新影响 0 行，请检查 ticketId 是否正确`)
        }

        // ---- 第二步：尝试更新可选时间戳列（即使失败也不回滚整体事务） ----
        try {
          if (hasUpdatedAt || hasWarehouseConfirmedAt || hasWarehouseConfirmedBy) {
            const optionalSetClauses = [
              ...(hasUpdatedAt ? [`UpdatedAt = GETUTCDATE()`] : []),
              ...(hasWarehouseConfirmedAt ? [`WarehouseConfirmedAt = GETUTCDATE()`] : []),
              ...(hasWarehouseConfirmedBy ? [`WarehouseConfirmedBy = @operatorName`] : []),
            ].join(', ')

            if (optionalSetClauses) {
              await transaction.request()
                .input("ticketId", Number(device.id))
                .input("operatorName", operatorName)
                .query(`
                  UPDATE Repair_Tickets
                  SET ${optionalSetClauses}
                  WHERE ${DB_FIELDS.ID} = @ticketId
                `)
            }
          }
        } catch (optionalError: unknown) {
          // 可选列更新失败不影响主流程，只记录日志
          const msg = optionalError instanceof Error ? optionalError.message : "未知错误"
          console.warn(`[Warehouse Confirm] 设备 ${device.id} 可选时间戳列更新失败（非致命）: ${msg}`)
        }

        // ---- 第三步：验证核心状态是否真的写入 ----
        const verifyResult = await transaction.request()
          .input("ticketId", Number(device.id))
          .query(`SELECT ${DB_FIELDS.STATUS} FROM Repair_Tickets WHERE ${DB_FIELDS.ID} = @ticketId`)
        
        const actualStatus = verifyResult.recordset[0]?.[DB_FIELDS.STATUS]
        console.log(`[Warehouse Confirm] 设备 ${device.id} 验证状态:`, {
          expected: newStatus,
          actual: actualStatus,
          match: actualStatus === newStatus
        })
        
        if (actualStatus !== newStatus) {
          throw new Error(`设备 ID=${device.id} 状态验证失败！数据库实际状态: "${actualStatus}"，期望: "${newStatus}"`)
        }

        confirmedCount += deviceQuantity
      }

      // 3.2 记录批次级别操作历史（使用新列名：BatchId, OperatorId, OperatorName, Description）
      // ⚠️ 修复：区分首次确认和重新确认的描述，确保操作日志清晰
      let description: string
      if (skippedCount > 0) {
        description = `仓库确认批次设备（本次确认：${confirmedCount} 台，已跳过已推进设备：${skippedCount} 台）`
      } else if (isReconfirmation) {
        description = `仓库已重新核对设备信息并更新出厂日期（共 ${confirmedCount} 台设备，状态已流转至维修检查中）`
      } else {
        description = `仓库首次确认设备并填写出厂日期（共 ${confirmedCount} 台设备，状态已流转至维修检查中）`
      }

      const historyRequest = transaction.request()
        .input("batchId", batchId)
        .input("actionType", TicketActionType.WAREHOUSE_CONFIRMED)
        .input("operatorId", parseInt(currentUser.UserID, 10))
        .input("operatorName", operatorName)
        .input("description", description)
        .input("oldStatus", isReconfirmation ? TicketStatus.WAREHOUSE_CONFIRMING : TicketStatus.CREATED)
        .input("newStatus", newStatus)
        .input("createdAt", new Date())

      // 检查 History 表是否有 OldStatus 和 NewStatus 列
      const historyColumnCheck = await transaction.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Repair_Ticket_History'
          AND COLUMN_NAME IN ('OldStatus', 'NewStatus')
      `)
      const hasOldStatus = historyColumnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'OldStatus')
      const hasNewStatus = historyColumnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'NewStatus')

      if (hasOldStatus && hasNewStatus) {
        await historyRequest.query(`
          INSERT INTO Repair_Ticket_History (
            BatchId, ActionType, OperatorId, OperatorName, Description, OldStatus, NewStatus, CreatedAt
          )
          VALUES (
            @batchId, @actionType, @operatorId, @operatorName, @description, @oldStatus, @newStatus, @createdAt
          )
        `)
      } else {
        await historyRequest.query(`
          INSERT INTO Repair_Ticket_History (
            BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt
          )
          VALUES (
            @batchId, @actionType, @operatorId, @operatorName, @description, @createdAt
          )
        `)
      }

      // 3.3 提交事务
      await transaction.commit();

    // ⚠️ 曾经的 bug：如果所有设备都被状态守卫跳过（confirmedCount === 0），
    // 之前这里依然返回 success: true，前端会弹出"确认成功"的提示，但实际状态根本没有变化，
    // 用户误以为已经推进，工单却仍然卡在原状态——这是一种"静默失败"。
    // 修复：没有任何设备真正被确认时，明确返回失败，让前端提示真实原因。
    if (confirmedCount === 0) {
      return NextResponse.json({
        success: false,
        message: `未能确认任何设备：所选 ${skippedCount} 台设备当前状态均已超出可确认范围（如：${Array.from(new Set(skippedDeviceStatuses)).join("、") || "未知"}），可能已被其他操作推进，请刷新页面后重试`,
        data: { batchId, deviceCount: 0, skippedCount }
      });
    }

    return NextResponse.json({
      success: true,
        message: skippedCount > 0
          ? `操作完成：${confirmedCount} 台设备已确认，${skippedCount} 台已推进设备已跳过`
          : `批次设备已确认，共 ${confirmedCount} 台设备，状态已更新为"维修检查中"`,
      data: {
        batchId,
          deviceCount: confirmedCount,
          skippedCount,
          operator: {
            id: currentUser.UserID,
            name: operatorName,
            role: normalizedRole
          }
      }
      });

    } catch (transactionError: unknown) {
      // 事务执行失败，安全回滚
      const errorMsg = transactionError instanceof Error ? transactionError.message : "未知错误"
      console.error("[Warehouse Confirm Batch] 事务执行失败:", errorMsg)
      if (transaction) {
        try {
          await transaction.rollback()
          transaction = null // ⚠️ 回滚成功后标记为null，避免外部catch再次回滚
        } catch (rollbackError: unknown) {
          // 忽略回滚本身的错误，避免掩盖原始错误
          const rbMsg = rollbackError instanceof Error ? rollbackError.message : "未知错误"
          console.error("事务回滚时发生忽略的错误:", rbMsg)
        }
      }
      throw transactionError
    }

  } catch (error: unknown) {
    // 安全回滚：只有在事务已存在且未完成时才回滚
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError: unknown) {
        // 忽略回滚本身的错误，避免掩盖原始错误
        const rbMsg = rollbackError instanceof Error ? rollbackError.message : "未知错误"
        console.error("事务回滚时发生忽略的错误:", rbMsg)
      }
    }
    
    const errorMsg = error instanceof Error ? error.message : "未知错误"
    console.error("[Warehouse Confirm Batch] 发生错误:", errorMsg)
    return NextResponse.json(
      { 
        success: false, 
        message: `操作失败: ${errorMsg}`
      },
      { status: 500 }
    )
  }
  // ⚠️ 注意：不要关闭连接池！getDbConnection() 返回的是单例连接池，会被所有 API 共享
  // 连接池会自动管理连接的生命周期，手动关闭会导致其他请求无法使用数据库
}
