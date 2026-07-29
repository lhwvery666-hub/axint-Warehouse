import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import {
  ALL_USER_ROLES,
  checkUserRole,
  isErrorResponse,
  type AuthenticatedUser,
} from "@/lib/auth-utils"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"

const updateTicketSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  action: z.enum([
    "delay",
    "supplementSN",
    "request_cancel",
    "approve_cancel",
    "reject_cancel",
  ]).optional(),
  status: z.string().trim().max(50).optional(),
  deleteToRecycleBin: z.boolean().optional(),
  supplementSN: z.boolean().optional(),
  newSerialNumber: z.string().trim().min(1).max(100).optional(),
  delayTo: z.string().datetime().optional(),
  delayReason: z.string().trim().min(1).max(500).optional(),
  cancelRequestReason: z.string().trim().min(1).max(2000).optional(),
  scrappedReason: z.string().trim().max(2000).optional(),
  cancelReason: z.string().trim().max(2000).optional(),
  receivedDate: z.string().datetime().optional(),
  factoryShipDate: z.string().datetime().optional(),
  returnDate: z.string().datetime().optional(),
  returnQuantity: z.number().int().min(0).max(100000).optional(),
  returnTrackingNum: z.string().trim().max(200).optional(),
}).strict()

interface UpdatedTicketRow {
  Id: number
  TicketId: string | null
  BatchId: string | null
  DeviceSN: string
  OldStatus: string
  NewStatus: string
}

interface InventoryRow {
  SerialNumber: string
  DeviceName: string | null
  MaterialCode: string | null
  Status: string | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError) {
    console.error("[Ticket Update API] 事务回滚失败:", rollbackError)
  }
  return null
}

async function writeHistory(
  transaction: sql.Transaction,
  user: AuthenticatedUser,
  row: UpdatedTicketRow,
  actionType: TicketActionType,
  description: string,
  delayTo: Date | null = null,
  delayReason: string | null = null
): Promise<void> {
  const operatorId = Number(user.userId)
  await new sql.Request(transaction)
    .input("ticketId", sql.NVarChar(50), row.TicketId ?? String(row.Id))
    .input("batchId", sql.NVarChar(50), row.BatchId)
    .input("actionType", sql.NVarChar(50), actionType)
    .input("oldStatus", sql.NVarChar(50), row.OldStatus)
    .input("newStatus", sql.NVarChar(50), row.NewStatus)
    .input("operatorId", sql.Int, operatorId)
    .input("operatorName", sql.NVarChar(100), user.realName || user.username)
    .input("description", sql.NVarChar(sql.MAX), description)
    .input("delayTo", sql.DateTime2, delayTo)
    .input("delayReason", sql.NVarChar(500), delayReason)
    .query(`
      INSERT INTO [dbo].[Repair_Ticket_History] (
        [TicketID], [BatchId], [ActionType], [OldStatus], [NewStatus],
        [OperatorId], [OperatorName], [Description], [DelayTo], [DelayReason], [CreatedAt]
      )
      VALUES (
        @ticketId, @batchId, @actionType, @oldStatus, @newStatus,
        @operatorId, @operatorName, @description, @delayTo, @delayReason, GETUTCDATE()
      );
    `)
}

function conflict(message = "工单状态已变化、请求重复或操作条件不满足") {
  return NextResponse.json({ success: false, message }, { status: 409 })
}

// PUT /api/tickets/[id]/update
// 仅保留有明确权限和状态断言的遗留单工单操作；标准批次流转使用专用 API。
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null

  try {
    const parsedBody = updateTicketSchema.safeParse(
      await request.json().catch(() => null)
    )
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "请求参数无效" },
        { status: 400 }
      )
    }

    const { id } = await context.params
    if (!/^\d+$/.test(id)) {
      return NextResponse.json(
        { success: false, message: "工单ID无效" },
        { status: 400 }
      )
    }

    const ticketId = Number(id)
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(ticketId) || !Number.isSafeInteger(operatorId)) {
      return NextResponse.json(
        { success: false, message: "身份或工单参数无效" },
        { status: 400 }
      )
    }

    const body = parsedBody.data
    if (body.id !== undefined && String(body.id) !== id) {
      return NextResponse.json(
        { success: false, message: "路径工单ID与请求内容不一致" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const role = authResult.normalizedRole
    let updated: UpdatedTicketRow | undefined
    let actionType = TicketActionType.STATUS_CHANGE
    let description = "更新工单状态"
    let historyDelayTo: Date | null = null
    let historyDelayReason: string | null = null

    const supplementSN = body.action === "supplementSN" || body.supplementSN === true
    if (supplementSN) {
      if (![UserRole.TECHNICIAN, UserRole.ADMIN].includes(role)) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "您没有权限补录设备序列号" },
          { status: 403 }
        )
      }
      if (!body.newSerialNumber) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "新序列号不能为空" },
          { status: 400 }
        )
      }

      const inventoryResult = await new sql.Request(transaction)
        .input("serialNumber", sql.NVarChar(100), body.newSerialNumber)
        .query<InventoryRow>(`
          SELECT TOP (1) [SerialNumber], [DeviceName], [MaterialCode], [Status]
          FROM [dbo].[Device_Inventory]
          WHERE [SerialNumber] = @serialNumber;
        `)
      const inventory = inventoryResult.recordset[0]
      if (!inventory) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "设备序列号不存在于设备档案中" },
          { status: 400 }
        )
      }

      const updateResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, ticketId)
        .input("newDeviceSN", sql.NVarChar(100), inventory.SerialNumber)
        .input("deviceName", sql.NVarChar(200), inventory.DeviceName)
        .input("materialCode", sql.NVarChar(100), inventory.MaterialCode)
        .query<UpdatedTicketRow>(`
          UPDATE [dbo].[Repair_Tickets]
          SET [DeviceSN] = @newDeviceSN,
              [DeviceName] = COALESCE(@deviceName, [DeviceName]),
              [MaterialCode] = COALESCE(@materialCode, [MaterialCode]),
              [UpdatedAt] = GETUTCDATE()
          OUTPUT inserted.[Id], inserted.[TicketId], inserted.[BatchId],
                 inserted.[DeviceSN], deleted.[Status] AS [OldStatus],
                 inserted.[Status] AS [NewStatus]
          WHERE [Id] = @ticketId
            AND [Status] NOT IN ('Completed', 'Cancelled', 'Scrapped', 'Deleted');
        `)
      updated = updateResult.recordset[0]
      if (updateResult.rowsAffected[0] !== 1 || !updated) {
        transaction = await rollback(transaction)
        return conflict()
      }

      if (["在库", "In Stock", "instock", "出库", "Out Stock", "outstock"]
        .includes(inventory.Status ?? "")) {
        await new sql.Request(transaction)
          .input("serialNumber", sql.NVarChar(100), inventory.SerialNumber)
          .input("newStatus", sql.NVarChar(50), "维修中")
          .query(`
            UPDATE [dbo].[Device_Inventory]
            SET [Status] = @newStatus, [UpdatedAt] = GETUTCDATE()
            WHERE [SerialNumber] = @serialNumber;
          `)
      }
      actionType = TicketActionType.SUPPLEMENT_SN
      description = `补录设备序列号：${inventory.SerialNumber}`
    } else if (body.action === "request_cancel") {
      if (role !== UserRole.REPORTER) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "只有工单创建人可以申请取消" },
          { status: 403 }
        )
      }
      if (!body.cancelRequestReason) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "取消原因不能为空" },
          { status: 400 }
        )
      }

      const updateResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, ticketId)
        .input("operatorId", sql.Int, operatorId)
        .input("reason", sql.NVarChar(sql.MAX), body.cancelRequestReason)
        .query<UpdatedTicketRow>(`
          UPDATE [dbo].[Repair_Tickets]
          SET [CancelRequestStatus] = 'Pending',
              [CancelRequestReason] = @reason,
              [CancelRequestDate] = GETUTCDATE(),
              [UpdatedAt] = GETUTCDATE()
          OUTPUT inserted.[Id], inserted.[TicketId], inserted.[BatchId],
                 inserted.[DeviceSN], deleted.[Status] AS [OldStatus],
                 inserted.[Status] AS [NewStatus]
          WHERE [Id] = @ticketId
            AND [ReportByUserID] = @operatorId
            AND [Status] NOT IN ('Completed', 'Cancelled', 'Scrapped', 'Deleted')
            AND ISNULL([CancelRequestStatus], '') <> 'Pending';
        `)
      updated = updateResult.recordset[0]
      if (updateResult.rowsAffected[0] !== 1 || !updated) {
        transaction = await rollback(transaction)
        return conflict("工单不可取消、已有待审批申请，或您不是该工单创建人")
      }
      actionType = TicketActionType.CANCEL_REQUEST
      description = `现场人员申请取消工单：${body.cancelRequestReason}`
    } else if (body.action === "approve_cancel" || body.action === "reject_cancel") {
      if (![UserRole.ADMIN, UserRole.BUSINESS].includes(role)) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "您没有权限审批取消申请" },
          { status: 403 }
        )
      }

      const approved = body.action === "approve_cancel"
      const updateResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, ticketId)
        .input("decision", sql.NVarChar(50), approved ? "Approved" : "Rejected")
        .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
        .query<UpdatedTicketRow>(`
          UPDATE [dbo].[Repair_Tickets]
          SET [CancelRequestStatus] = @decision,
              [CancelApprovedBy] = @operatorName,
              [CancelApprovedDate] = GETUTCDATE(),
              [Status] = CASE WHEN @decision = 'Approved' THEN 'Cancelled' ELSE [Status] END,
              [UpdatedAt] = GETUTCDATE()
          OUTPUT inserted.[Id], inserted.[TicketId], inserted.[BatchId],
                 inserted.[DeviceSN], deleted.[Status] AS [OldStatus],
                 inserted.[Status] AS [NewStatus]
          WHERE [Id] = @ticketId
            AND [CancelRequestStatus] = 'Pending'
            AND [Status] NOT IN ('Completed', 'Cancelled', 'Scrapped', 'Deleted');
        `)
      updated = updateResult.recordset[0]
      if (updateResult.rowsAffected[0] !== 1 || !updated) {
        transaction = await rollback(transaction)
        return conflict("取消申请已被处理或工单状态已变化")
      }
      actionType = approved
        ? TicketActionType.CANCEL_APPROVED
        : TicketActionType.CANCEL_REJECTED
      description = approved ? "取消申请已批准" : "取消申请已拒绝"
    } else if (body.action === "delay") {
      if (role !== UserRole.TECHNICIAN) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "只有维修工程师可以申请延期" },
          { status: 403 }
        )
      }
      if (!body.delayTo || !body.delayReason) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "延期日期和原因不能为空" },
          { status: 400 }
        )
      }
      const delayDate = new Date(body.delayTo)
      if (delayDate.getTime() <= Date.now()) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "延期日期必须晚于当前时间" },
          { status: 400 }
        )
      }

      const updateResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, ticketId)
        .input("expectedStatus", sql.NVarChar(50), TicketStatus.IN_REPAIR)
        .input("legacyExpectedStatus", sql.NVarChar(50), TicketStatus.PROCESSING)
        .input("newStatus", sql.NVarChar(50), TicketStatus.DELAYED)
        .query<UpdatedTicketRow>(`
          UPDATE [dbo].[Repair_Tickets]
          SET [Status] = @newStatus, [UpdatedAt] = GETUTCDATE()
          OUTPUT inserted.[Id], inserted.[TicketId], inserted.[BatchId],
                 inserted.[DeviceSN], deleted.[Status] AS [OldStatus],
                 inserted.[Status] AS [NewStatus]
          WHERE [Id] = @ticketId
            AND [Status] IN (@expectedStatus, @legacyExpectedStatus);
        `)
      updated = updateResult.recordset[0]
      if (updateResult.rowsAffected[0] !== 1 || !updated) {
        transaction = await rollback(transaction)
        return conflict("只有维修检查中的工单可以申请延期")
      }
      actionType = TicketActionType.DELAY
      description = `申请延期至 ${body.delayTo}：${body.delayReason}`
      historyDelayTo = delayDate
      historyDelayReason = body.delayReason
    } else {
      const hasWarehouseFields = [
        body.receivedDate,
        body.factoryShipDate,
        body.returnDate,
        body.returnQuantity,
        body.returnTrackingNum,
      ].some((value) => value !== undefined)

      if (hasWarehouseFields) {
        if (![UserRole.WAREHOUSE, UserRole.ADMIN].includes(role)) {
          transaction = await rollback(transaction)
          return NextResponse.json(
            { success: false, message: "您没有权限更新仓库字段" },
            { status: 403 }
          )
        }

        const trackingNumber = body.returnTrackingNum?.replace(/\s+/g, "") || null
        const completesTicket = Boolean(trackingNumber)
        const updateResult = await new sql.Request(transaction)
          .input("ticketId", sql.Int, ticketId)
          .input("receivedDate", sql.DateTime2, body.receivedDate ? new Date(body.receivedDate) : null)
          .input("factoryShipDate", sql.DateTime2, body.factoryShipDate ? new Date(body.factoryShipDate) : null)
          .input("returnDate", sql.DateTime2, body.returnDate ? new Date(body.returnDate) : null)
          .input("returnQuantity", sql.Int, body.returnQuantity ?? null)
          .input("returnTrackingNum", sql.NVarChar(200), trackingNumber)
          .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
          .input("newStatus", sql.NVarChar(50), completesTicket ? TicketStatus.COMPLETED : null)
          .query<UpdatedTicketRow>(`
            UPDATE [dbo].[Repair_Tickets]
            SET [ReceivedDate] = COALESCE(@receivedDate, [ReceivedDate]),
                [FactoryShipDate] = COALESCE(@factoryShipDate, [FactoryShipDate]),
                [ReturnDate] = COALESCE(@returnDate, [ReturnDate]),
                [ReturnQuantity] = COALESCE(@returnQuantity, [ReturnQuantity]),
                [ReturnTrackingNum] = COALESCE(@returnTrackingNum, [ReturnTrackingNum]),
                [Status] = COALESCE(@newStatus, [Status]),
                [WarehouseShippedAt] = CASE WHEN @newStatus = 'Completed' THEN GETUTCDATE() ELSE [WarehouseShippedAt] END,
                [WarehouseShippedBy] = CASE WHEN @newStatus = 'Completed' THEN @operatorName ELSE [WarehouseShippedBy] END,
                [UpdatedAt] = GETUTCDATE()
            OUTPUT inserted.[Id], inserted.[TicketId], inserted.[BatchId],
                   inserted.[DeviceSN], deleted.[Status] AS [OldStatus],
                   inserted.[Status] AS [NewStatus]
            WHERE [Id] = @ticketId
              AND (
                (@newStatus IS NULL AND [Status] NOT IN ('Completed', 'Cancelled', 'Scrapped', 'Deleted'))
                OR (@newStatus = 'Completed' AND [Status] IN ('Warehouse_Shipping', 'Pending_Shipment'))
              );
          `)
        updated = updateResult.recordset[0]
        if (updateResult.rowsAffected[0] !== 1 || !updated) {
          transaction = await rollback(transaction)
          return conflict("当前工单状态不允许更新仓库字段或确认发货")
        }
        actionType = updated.OldStatus === updated.NewStatus
          ? TicketActionType.STATUS_CHANGE
          : TicketActionType.WAREHOUSE_SHIPPED
        description = completesTicket ? "仓库确认发货并完成工单" : "更新仓库物流信息"
      } else {
        const requestedStatus = body.deleteToRecycleBin
          ? TicketStatus.DELETED
          : body.status?.trim()

        if (!requestedStatus) {
          transaction = await rollback(transaction)
          return NextResponse.json(
            { success: false, message: "没有可执行的更新内容" },
            { status: 400 }
          )
        }

        let expectedPredicate: string
        let targetStatus: TicketStatus
        if (["pending", "created"].includes(requestedStatus.toLowerCase())) {
          if (![UserRole.TECHNICIAN, UserRole.ADMIN].includes(role)) {
            transaction = await rollback(transaction)
            return NextResponse.json(
              { success: false, message: "您没有权限恢复工单" },
              { status: 403 }
            )
          }
          targetStatus = TicketStatus.CREATED
          expectedPredicate = "[Status] = 'Deleted'"
          description = "从回收站恢复工单"
        } else if (requestedStatus.toLowerCase() === "deleted") {
          if (![UserRole.TECHNICIAN, UserRole.ADMIN].includes(role)) {
            transaction = await rollback(transaction)
            return NextResponse.json(
              { success: false, message: "您没有权限移入回收站" },
              { status: 403 }
            )
          }
          targetStatus = TicketStatus.DELETED
          expectedPredicate = "[Status] NOT IN ('Completed', 'Cancelled', 'Scrapped', 'Deleted')"
          description = "工单移入回收站"
        } else if (requestedStatus.toLowerCase() === "cancelled") {
          if (![UserRole.ADMIN, UserRole.BUSINESS].includes(role)) {
            transaction = await rollback(transaction)
            return NextResponse.json(
              { success: false, message: "您没有权限直接取消工单" },
              { status: 403 }
            )
          }
          targetStatus = TicketStatus.CANCELLED
          expectedPredicate = "[Status] IN ('Created', 'In_Repair', 'Admin_Review', 'Business_Review')"
          description = body.cancelReason
            ? `管理员取消工单：${body.cancelReason}`
            : "管理员取消工单"
        } else {
          transaction = await rollback(transaction)
          return conflict("该状态必须通过对应的专用工作流接口流转")
        }

        const updateResult = await new sql.Request(transaction)
          .input("ticketId", sql.Int, ticketId)
          .input("newStatus", sql.NVarChar(50), targetStatus)
          .query<UpdatedTicketRow>(`
            UPDATE [dbo].[Repair_Tickets]
            SET [Status] = @newStatus, [UpdatedAt] = GETUTCDATE()
            OUTPUT inserted.[Id], inserted.[TicketId], inserted.[BatchId],
                   inserted.[DeviceSN], deleted.[Status] AS [OldStatus],
                   inserted.[Status] AS [NewStatus]
            WHERE [Id] = @ticketId AND ${expectedPredicate};
          `)
        updated = updateResult.recordset[0]
        if (updateResult.rowsAffected[0] !== 1 || !updated) {
          transaction = await rollback(transaction)
          return conflict()
        }
      }
    }

    await writeHistory(
      transaction,
      authResult,
      updated,
      actionType,
      description,
      historyDelayTo,
      historyDelayReason
    )
    await transaction.commit()
    transaction = null

    return NextResponse.json({
      success: true,
      message: description,
      data: {
        ticketId: updated.Id,
        oldStatus: updated.OldStatus,
        newStatus: updated.NewStatus,
        statusChanged: updated.OldStatus !== updated.NewStatus,
      },
    })
  } catch (error: unknown) {
    console.error("[Ticket Update API] 更新失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json(
      { success: false, message: "更新工单失败，请稍后重试" },
      { status: 500 }
    )
  }
}
