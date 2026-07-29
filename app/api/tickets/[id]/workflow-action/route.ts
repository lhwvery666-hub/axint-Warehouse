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
import { TicketActionType, UserRole } from "@/lib/enums";
import {
  TicketAction,
  getTransitionForActionAndRole,
  TICKET_ACTION_LABELS,
} from "@/lib/ticket-workflow-actions";

const workflowActionSchema = z.object({
  action: z.nativeEnum(TicketAction),
  // 兼容旧客户端，但服务端明确忽略该值，当前状态只能来自数据库。
  currentStatus: z.unknown().optional(),
  userRole: z.unknown().optional(),
  signedReportPhoto: z.string().trim().min(1).max(2048).optional(),
}).strict();

interface WorkflowUpdateRow {
  OldStatus: string;
  NewStatus: string;
  TicketId: string | null;
  BatchId: string | null;
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
    const parsedBody = workflowActionSchema.safeParse(
      await request.json().catch(() => null)
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

    const { action, signedReportPhoto } = parsedBody.data;
    const transition = getTransitionForActionAndRole(
      action,
      authResult.normalizedRole
    );
    if (!transition) {
      return NextResponse.json(
        { success: false, message: "您没有权限执行该操作" },
        { status: 403 }
      );
    }

    if (action === TicketAction.UPLOAD_SIGNATURE && !signedReportPhoto) {
      return NextResponse.json(
        { success: false, message: "缺少签字凭证" },
        { status: 400 }
      );
    }

    const pool = await getDbConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const updateRequest = new sql.Request(transaction)
      .input("ticketId", sql.Int, ticketId)
      .input("expectedStatus", sql.NVarChar(50), transition.currentStatus)
      .input("newStatus", sql.NVarChar(50), transition.nextStatus)
      .input("operatorId", sql.Int, operatorId)
      .input("signedReportPhoto", sql.NVarChar(sql.MAX), signedReportPhoto ?? null);

    const setSignedPhoto = action === TicketAction.UPLOAD_SIGNATURE
      ? ", [SignedReportPhoto] = @signedReportPhoto, [ReporterConfirmedAt] = GETUTCDATE()"
      : "";
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
          ${setSignedPhoto}
      OUTPUT deleted.[Status] AS [OldStatus],
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
