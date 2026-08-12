/**
 * 工单工作流动作 API
 * 
 * POST /api/tickets/[id]/workflow-action
 * 
 * 功能：
 * - 执行工单工作流状态流转
 * - 严格的权限校验（基于角色和状态）
 * - 使用数据库事务确保数据一致性
 * - 记录操作历史（审计日志）
 * 
 * 遵守 .cursorrules 规范：
 * - 第一行进行权限校验
 * - 使用数据库事务
 * - 记录审计日志
 * - 返回结构化对象 { success, message, data }
 */

import { NextResponse } from "next/server";
import * as sql from "mssql";
import { z } from "zod";
import { getDbConnection } from "@/lib/db-config";
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils";
import { RepairAction, TicketActionType, TicketStatus, UserRole } from "@/lib/enums";
import {
  TicketAction,
  getTransitionsForActionAndRole,
  TICKET_ACTION_LABELS,
} from "@/lib/ticket-workflow-actions";
import { sumDeviceQuantity } from "@/lib/device-quantity";

const workflowActionSchema = z.object({
  action: z.nativeEnum(TicketAction),
  // 兼容旧客户端，但服务端明确忽略该值，当前状态只能来自数据库。
  currentStatus: z.unknown().optional(),
  userRole: z.unknown().optional(),
}).strict();

interface WorkflowUpdateRow {
  Id: number;
  OldStatus: string;
  NewStatus: string;
  TicketId: string | null;
  BatchId: string | null;
}

interface BatchAnchorRow {
  Id: number;
  BatchId: string | null;
}

interface FactoryBatchRow {
  Id: number;
  TicketId: string | null;
  BatchId: string;
  Status: string;
  RepairReportContent: string | null;
  RepairCost: number | null;
  Quantity: number | null;
}

interface FactoryDeviceRow {
  Id: number;
  TicketId: string | null;
  BatchId: string | null;
  Status: string;
  RepairAction: string | null;
  SupplierName: string | null;
  FactoryTrackingNum: string | null;
  SignedReportPhoto: string | null;
  DeviceSN: string | null;
  ModelName: string | null;
  Quantity: number | null;
}

const BATCH_ACTIONS = new Set<TicketAction>([
  TicketAction.SEND_REPORT_FOR_SIGN,
]);

function hasRepairReportContent(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("repairContent" in parsed)) return false;
    const repairContent = (parsed as { repairContent?: unknown }).repairContent;
    return typeof repairContent === "string" && repairContent.trim().length > 0;
  } catch {
    return false;
  }
}

// ==================== 主 API 处理函数 ====================

/**
 * POST /api/tickets/[id]/workflow-action
 * 执行工单工作流动作
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES);
  if (isErrorResponse(authResult)) return authResult;

  let transaction: sql.Transaction | null = null;

  try {
    let signedPhotoFile: File | null = null;
    let rawBody: unknown;
    if (request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      const formData = await request.formData();
      const fileValue = formData.get("signedPhoto");
      if (fileValue !== null && !(fileValue instanceof File)) {
        return NextResponse.json(
          { success: false, message: "签字凭证格式无效" },
          { status: 400 }
        );
      }
      signedPhotoFile = fileValue;
      rawBody = { action: formData.get("action") };
    } else {
      rawBody = await request.json().catch(() => null);
    }
    const parsedBody = workflowActionSchema.safeParse(
      rawBody
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "请求参数无效" },
        { status: 400 }
      );
    }

    const { id } = await context.params;
    if (!/^\d+$/.test(id)) {
      return NextResponse.json(
        { success: false, message: "工单ID无效" },
        { status: 400 }
      );
    }

    const ticketId = Number(id);
    const operatorId = Number(authResult.userId);
    if (!Number.isSafeInteger(ticketId) || !Number.isSafeInteger(operatorId)) {
      return NextResponse.json(
        { success: false, message: "身份或工单参数无效" },
        { status: 400 }
      );
    }

    const { action } = parsedBody.data;
    if (action === TicketAction.UPLOAD_SIGNATURE) {
      return NextResponse.json(
        {
          success: false,
          message: "该旧入口已停用，请先保存签字附件，再通过现场确认接口发送流程",
        },
        { status: 410 }
      );
    }

    const transitions = getTransitionsForActionAndRole(
      action,
      authResult.normalizedRole
    );
    if (transitions.length === 0) {
      return NextResponse.json(
        { success: false, message: "您没有权限执行该操作" },
        { status: 403 }
      );
    }

    if (signedPhotoFile) {
      return NextResponse.json(
        { success: false, message: "当前动作不接受签字凭证" },
        { status: 400 }
      );
    }

    const pool = await getDbConnection();
    transaction = new sql.Transaction(pool);
    const isBatchAction = BATCH_ACTIONS.has(action);
    const requiresSerializable =
      isBatchAction || action === TicketAction.REQUEST_FACTORY_REPAIR;
    await transaction.begin(
      requiresSerializable
        ? sql.ISOLATION_LEVEL.SERIALIZABLE
        : sql.ISOLATION_LEVEL.READ_COMMITTED
    );

    if (isBatchAction) {
      const anchorResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, ticketId)
        .query<BatchAnchorRow>(`
          SELECT TOP (1) [Id], [BatchId]
          FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
          WHERE [Id] = @ticketId;
        `);
      const anchor = anchorResult.recordset[0];
      if (!anchor) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "工单不存在" },
          { status: 404 }
        );
      }
      if (!anchor.BatchId) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "该工单未归属批次，无法执行整批报告流转" },
          { status: 409 }
        );
      }

      const batchResult = await new sql.Request(transaction)
        .input("batchId", sql.NVarChar(100), anchor.BatchId)
        .query<FactoryBatchRow>(`
          SELECT [Id], [TicketId], [BatchId], [Status],
                 [RepairReportContent], [RepairCost], [Quantity]
          FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
          WHERE [BatchId] = @batchId
          ORDER BY [Id];
        `);
      const batchRows = batchResult.recordset;
      if (batchRows.length === 0) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "批次工单不存在" },
          { status: 404 }
        );
      }

      const allowedStatuses = new Set<string>(transitions.map((item) => item.currentStatus));
      const invalidStatusRow = batchRows.find((row) => !allowedStatuses.has(row.Status));
      if (invalidStatusRow) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          {
            success: false,
            message: `批次内设备状态不一致或已变化（设备ID：${invalidStatusRow.Id}），未执行任何更新`,
          },
          { status: 409 }
        );
      }

      if (action === TicketAction.SEND_REPORT_FOR_SIGN) {
        const incompleteRow = batchRows.find(
          (row) => !hasRepairReportContent(row.RepairReportContent) || row.RepairCost === null
        );
        if (incompleteRow) {
          await transaction.rollback();
          transaction = null;
          return NextResponse.json(
            {
              success: false,
              message: `请先保存整批设备的维修报告和费用（设备ID：${incompleteRow.Id}）`,
            },
            { status: 409 }
          );
        }
      }

      const expectedStatus0 = transitions[0].currentStatus;
      const expectedStatus1 = transitions[1]?.currentStatus ?? expectedStatus0;
      const expectedStatus2 = transitions[2]?.currentStatus ?? expectedStatus0;
      const nextStatus = transitions[0].nextStatus;

      const updateResult = await new sql.Request(transaction)
        .input("batchId", sql.NVarChar(100), anchor.BatchId)
        .input("expectedStatus0", sql.NVarChar(50), expectedStatus0)
        .input("expectedStatus1", sql.NVarChar(50), expectedStatus1)
        .input("expectedStatus2", sql.NVarChar(50), expectedStatus2)
        .input("newStatus", sql.NVarChar(50), nextStatus)
        .query<WorkflowUpdateRow>(`
          UPDATE [dbo].[Repair_Tickets]
          SET [Status] = @newStatus,
              [UpdatedAt] = GETUTCDATE()
          OUTPUT inserted.[Id] AS [Id],
                 deleted.[Status] AS [OldStatus],
                 inserted.[Status] AS [NewStatus],
                 inserted.[TicketId] AS [TicketId],
                 inserted.[BatchId] AS [BatchId]
          WHERE [BatchId] = @batchId
            AND [Status] IN (@expectedStatus0, @expectedStatus1, @expectedStatus2);
        `);

      if (updateResult.recordset.length !== batchRows.length) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "批次状态已变化或请求重复，未执行任何更新" },
          { status: 409 }
        );
      }

      const actionType = TicketActionType.REPAIR_REPORT_SUBMITTED;
      const totalQuantity = sumDeviceQuantity(
        batchRows.map((row) => ({ quantity: row.Quantity }))
      );
      const description = `${TICKET_ACTION_LABELS[action]}（批次 ${anchor.BatchId}，共 ${totalQuantity} 台）`;

      for (const updated of updateResult.recordset) {
        await new sql.Request(transaction)
          .input("ticketId", sql.NVarChar(50), updated.TicketId ?? String(updated.Id))
          .input("batchId", sql.NVarChar(100), anchor.BatchId)
          .input("actionType", sql.NVarChar(50), actionType)
          .input("oldStatus", sql.NVarChar(50), updated.OldStatus)
          .input("newStatus", sql.NVarChar(50), updated.NewStatus)
          .input("operatorId", sql.Int, operatorId)
          .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
          .input("description", sql.NVarChar(sql.MAX), description)
          .query(`
            INSERT INTO [dbo].[Repair_Ticket_History] (
              [TicketID], [BatchId], [ActionType], [OldStatus], [NewStatus],
              [OperatorId], [OperatorName], [Description], [CreatedAt]
            )
            VALUES (
              @ticketId, @batchId, @actionType, @oldStatus, @newStatus,
              @operatorId, @operatorName, @description, GETUTCDATE()
            );
          `);
      }

      await transaction.commit();
      transaction = null;
      return NextResponse.json({
        success: true,
        message: `${TICKET_ACTION_LABELS[action]}成功`,
        data: {
          batchId: anchor.BatchId,
          updatedRowCount: updateResult.recordset.length,
          deviceCount: totalQuantity,
          newStatus: nextStatus,
          action,
        },
      });
    }

    if (action === TicketAction.REQUEST_FACTORY_REPAIR) {
      const deviceResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, ticketId)
        .query<FactoryDeviceRow>(`
          SELECT TOP (1)
                 [Id], [TicketId], [BatchId], [Status], [RepairAction],
                 [SupplierName], [FactoryTrackingNum], [SignedReportPhoto],
                 [DeviceSN], [ModelName], [Quantity]
          FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
          WHERE [Id] = @ticketId;
        `);
      const device = deviceResult.recordset[0];
      if (!device) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "设备工单不存在" },
          { status: 404 }
        );
      }

      const transition = transitions.find(
        (item) => item.currentStatus === device.Status
      );
      if (!transition) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "当前设备状态已变化或不允许提交返厂维修" },
          { status: 409 }
        );
      }

      if (
        device.Status !== TicketStatus.TECHNICIAN_REPAIRING ||
        !device.SignedReportPhoto?.trim()
      ) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          {
            success: false,
            message: "现场签字凭证尚未回传，当前设备不能正式发起返厂维修",
          },
          { status: 409 }
        );
      }

      if (
        device.RepairAction !== RepairAction.RMA ||
        !device.SupplierName?.trim() ||
        !device.FactoryTrackingNum?.trim()
      ) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          {
            success: false,
            message: "请先保存当前设备的返厂方式、供应商和快递单号，再发送流程",
          },
          { status: 409 }
        );
      }

      const updateResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, ticketId)
        .input("expectedStatus", sql.NVarChar(50), transition.currentStatus)
        .input("newStatus", sql.NVarChar(50), transition.nextStatus)
        .query<WorkflowUpdateRow>(`
          UPDATE [dbo].[Repair_Tickets]
          SET [Status] = @newStatus,
              [IsOutsourced] = 1,
              [UpdatedAt] = GETUTCDATE()
          OUTPUT inserted.[Id] AS [Id],
                 deleted.[Status] AS [OldStatus],
                 inserted.[Status] AS [NewStatus],
                 inserted.[TicketId] AS [TicketId],
                 inserted.[BatchId] AS [BatchId]
          WHERE [Id] = @ticketId
            AND [Status] = @expectedStatus;
        `);

      if (updateResult.rowsAffected[0] !== 1 || !updateResult.recordset[0]) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "当前设备状态已变化或请求重复，未执行更新" },
          { status: 409 }
        );
      }

      const updated = updateResult.recordset[0];
      const deviceIdentity = device.DeviceSN?.trim() || device.ModelName?.trim() || `设备 ${device.Id}`;
      const deviceQuantity = sumDeviceQuantity([{ quantity: device.Quantity }]);
      await new sql.Request(transaction)
        .input("ticketId", sql.NVarChar(50), updated.TicketId ?? String(updated.Id))
        .input("batchId", sql.NVarChar(100), updated.BatchId)
        .input("actionType", sql.NVarChar(50), TicketActionType.RMA_REQUEST)
        .input("oldStatus", sql.NVarChar(50), updated.OldStatus)
        .input("newStatus", sql.NVarChar(50), updated.NewStatus)
        .input("operatorId", sql.Int, operatorId)
        .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
        .input(
          "description",
          sql.NVarChar(sql.MAX),
          `提交当前设备返厂维修申请（${deviceIdentity}，共 ${deviceQuantity} 台）`
        )
        .query(`
          INSERT INTO [dbo].[Repair_Ticket_History] (
            [TicketID], [BatchId], [ActionType], [OldStatus], [NewStatus],
            [OperatorId], [OperatorName], [Description], [CreatedAt]
          )
          VALUES (
            @ticketId, @batchId, @actionType, @oldStatus, @newStatus,
            @operatorId, @operatorName, @description, GETUTCDATE()
          );
        `);

      await transaction.commit();
      transaction = null;
      return NextResponse.json({
        success: true,
        message: "当前设备已提交返厂维修",
        data: {
          ticketId,
          batchId: updated.BatchId,
          oldStatus: updated.OldStatus,
          newStatus: updated.NewStatus,
          deviceCount: deviceQuantity,
          action,
        },
      });
    }

    if (transitions.length !== 1) {
      await transaction.rollback();
      transaction = null;
      console.error("[Workflow Action API] 非批次动作存在多条服务端流转规则", {
        action,
        role: authResult.normalizedRole,
      });
      return NextResponse.json(
        { success: false, message: "工作流配置异常" },
        { status: 500 }
      );
    }
    const transition = transitions[0];

    const updateRequest = new sql.Request(transaction)
      .input("ticketId", sql.Int, ticketId)
      .input("expectedStatus", sql.NVarChar(50), transition.currentStatus)
      .input("newStatus", sql.NVarChar(50), transition.nextStatus)
      .input("operatorId", sql.Int, operatorId);
    const reporterOwnership = authResult.normalizedRole === UserRole.REPORTER
      ? "AND [ReportByUserID] = @operatorId"
      : "";
    const precondition = action === TicketAction.CONFIRM_RECEIPT
      ? "AND [ManufactureDate] IS NOT NULL"
      : action === TicketAction.SEND_REPORT_FOR_SIGN
        ? "AND NULLIF(LTRIM(RTRIM(ISNULL([FaultPoint], ''))), '') IS NOT NULL AND [RepairCost] IS NOT NULL"
        : "";

    const updateResult = await updateRequest.query<WorkflowUpdateRow>(`
      UPDATE [dbo].[Repair_Tickets]
      SET [Status] = @newStatus,
          [UpdatedAt] = GETUTCDATE()
      OUTPUT inserted.[Id] AS [Id],
             deleted.[Status] AS [OldStatus],
             inserted.[Status] AS [NewStatus],
             inserted.[TicketId] AS [TicketId],
             inserted.[BatchId] AS [BatchId]
      WHERE [Id] = @ticketId
        AND [Status] = @expectedStatus
        ${reporterOwnership}
        ${precondition};
    `);

    if (updateResult.rowsAffected[0] !== 1 || !updateResult.recordset[0]) {
      await transaction.rollback();
      transaction = null;
      return NextResponse.json(
        { success: false, message: "工单状态已变化、操作重复或前置条件未满足" },
        { status: 409 }
      );
    }

    const updated = updateResult.recordset[0];
    await new sql.Request(transaction)
      .input("ticketId", sql.NVarChar(50), updated.TicketId ?? id)
      .input("batchId", sql.NVarChar(50), updated.BatchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.STATUS_CHANGE)
      .input("oldStatus", sql.NVarChar(50), updated.OldStatus)
      .input("newStatus", sql.NVarChar(50), updated.NewStatus)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), TICKET_ACTION_LABELS[action])
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [TicketID], [BatchId], [ActionType], [OldStatus], [NewStatus],
          [OperatorId], [OperatorName], [Description], [CreatedAt]
        )
        VALUES (
          @ticketId, @batchId, @actionType, @oldStatus, @newStatus,
          @operatorId, @operatorName, @description, GETUTCDATE()
        );
      `);

    await transaction.commit();
    transaction = null;

    return NextResponse.json({
      success: true,
      message: `操作成功：${TICKET_ACTION_LABELS[action]}`,
      data: {
        ticketId,
        oldStatus: updated.OldStatus,
        newStatus: updated.NewStatus,
        action,
      },
    });
  } catch (error: unknown) {
    console.error("[Workflow Action API] 执行失败:", error);
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("[Workflow Action API] 事务回滚失败:", rollbackError);
      } finally {
        transaction = null;
      }
    }
    return NextResponse.json(
      { success: false, message: "操作失败，请稍后重试" },
      { status: 500 }
    );
  }
}
