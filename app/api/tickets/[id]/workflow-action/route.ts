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
import { RepairAction, TicketActionType, UserRole } from "@/lib/enums";
import {
  TicketAction,
  getTransitionsForActionAndRole,
  TICKET_ACTION_LABELS,
} from "@/lib/ticket-workflow-actions";
import { sumDeviceQuantity } from "@/lib/device-quantity";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { createUploadStoragePath, validateUploadedFile } from "@/lib/storage/upload-security";

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
  RepairAction: string | null;
  SupplierName: string | null;
  FactoryTrackingNum: string | null;
  Quantity: number | null;
}

const FACTORY_BATCH_ACTIONS = new Set<TicketAction>([
  TicketAction.REQUEST_FACTORY_REPAIR,
  TicketAction.CONFIRM_FACTORY_RETURN,
]);

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
  let newlyUploadedPath: string | null = null;

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

    if (action === TicketAction.UPLOAD_SIGNATURE && !signedPhotoFile) {
      return NextResponse.json(
        { success: false, message: "缺少签字凭证" },
        { status: 400 }
      );
    }
    if (action !== TicketAction.UPLOAD_SIGNATURE && signedPhotoFile) {
      return NextResponse.json(
        { success: false, message: "当前动作不接受签字凭证" },
        { status: 400 }
      );
    }

    const pool = await getDbConnection();
    transaction = new sql.Transaction(pool);
    const isFactoryBatchAction = FACTORY_BATCH_ACTIONS.has(action);
    await transaction.begin(
      isFactoryBatchAction
        ? sql.ISOLATION_LEVEL.SERIALIZABLE
        : sql.ISOLATION_LEVEL.READ_COMMITTED
    );

    if (isFactoryBatchAction) {
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
          { success: false, message: "该工单未归属批次，无法执行整批返厂流转" },
          { status: 409 }
        );
      }

      const batchResult = await new sql.Request(transaction)
        .input("batchId", sql.NVarChar(100), anchor.BatchId)
        .query<FactoryBatchRow>(`
          SELECT [Id], [TicketId], [BatchId], [Status], [RepairAction],
                 [SupplierName], [FactoryTrackingNum], [Quantity]
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

      if (action === TicketAction.REQUEST_FACTORY_REPAIR) {
        const incompleteRow = batchRows.find(
          (row) =>
            row.RepairAction !== RepairAction.RMA ||
            !row.SupplierName?.trim() ||
            !row.FactoryTrackingNum?.trim()
        );
        if (incompleteRow) {
          await transaction.rollback();
          transaction = null;
          return NextResponse.json(
            {
              success: false,
              message: `请先保存整批设备的返厂方式、供应商和快递单号（设备ID：${incompleteRow.Id}）`,
            },
            { status: 409 }
          );
        }
      }

      const expectedStatus0 = transitions[0].currentStatus;
      const expectedStatus1 = transitions[1]?.currentStatus ?? expectedStatus0;
      const nextStatus = transitions[0].nextStatus;
      const setFactoryFields = action === TicketAction.REQUEST_FACTORY_REPAIR
        ? ", [IsOutsourced] = 1"
        : ", [FactoryReceivedDate] = GETUTCDATE()";

      const updateResult = await new sql.Request(transaction)
        .input("batchId", sql.NVarChar(100), anchor.BatchId)
        .input("expectedStatus0", sql.NVarChar(50), expectedStatus0)
        .input("expectedStatus1", sql.NVarChar(50), expectedStatus1)
        .input("newStatus", sql.NVarChar(50), nextStatus)
        .query<WorkflowUpdateRow>(`
          UPDATE [dbo].[Repair_Tickets]
          SET [Status] = @newStatus,
              [UpdatedAt] = GETUTCDATE()
              ${setFactoryFields}
          OUTPUT inserted.[Id] AS [Id],
                 deleted.[Status] AS [OldStatus],
                 inserted.[Status] AS [NewStatus],
                 inserted.[TicketId] AS [TicketId],
                 inserted.[BatchId] AS [BatchId]
          WHERE [BatchId] = @batchId
            AND [Status] IN (@expectedStatus0, @expectedStatus1);
        `);

      if (updateResult.recordset.length !== batchRows.length) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: "批次状态已变化或请求重复，未执行任何更新" },
          { status: 409 }
        );
      }

      const actionType = action === TicketAction.REQUEST_FACTORY_REPAIR
        ? TicketActionType.RMA_REQUEST
        : TicketActionType.FACTORY_RETURN_CONFIRMED;
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

    let signedReportPhoto: string | null = null;
    if (action === TicketAction.UPLOAD_SIGNATURE && signedPhotoFile) {
      const validation = await validateUploadedFile(signedPhotoFile, "signature");
      if (!validation.success) {
        await transaction.rollback();
        transaction = null;
        return NextResponse.json(
          { success: false, message: validation.message },
          { status: 400 }
        );
      }
      const storagePath = createUploadStoragePath(
        "signature",
        authResult.userId,
        validation.extension
      );
      signedReportPhoto = await getStorageAdapter().upload(
        storagePath,
        signedPhotoFile,
        validation.mimeType
      );
      newlyUploadedPath = signedReportPhoto;
    }

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
      if (newlyUploadedPath) {
        await getStorageAdapter().delete(newlyUploadedPath);
        newlyUploadedPath = null;
      }
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
    newlyUploadedPath = null;

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
    if (newlyUploadedPath) {
      try {
        await getStorageAdapter().delete(newlyUploadedPath);
      } catch (cleanupError) {
        console.error("[Workflow Action API] 清理失败上传文件失败:", cleanupError);
      } finally {
        newlyUploadedPath = null;
      }
    }

    return NextResponse.json(
      { success: false, message: "操作失败，请稍后重试" },
      { status: 500 }
    );
  }
}
