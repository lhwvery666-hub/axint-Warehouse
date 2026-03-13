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
import { cookies } from "next/headers";
import { getDbConnection } from "@/lib/db-config";
import {
  TicketStatus,
  UserRole,
  normalizeUserRole,
  normalizeTicketStatus,
  TicketActionType,
} from "@/lib/enums";
import {
  TicketAction,
  getNextStatusForAction,
  canExecuteAction,
  TICKET_ACTION_LABELS,
} from "@/lib/ticket-workflow-actions";

// ==================== 辅助函数 ====================

/**
 * 从 Cookie 获取当前登录用户
 */
async function getCurrentUser(cookieStore: ReturnType<typeof cookies>) {
  const userCookie = (await cookieStore).get("user");
  if (!userCookie?.value) {
    return null;
  }

  try {
    const user = JSON.parse(userCookie.value);
    const normalizedRole = normalizeUserRole(user.role);
    if (!normalizedRole) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      realName: (user.realName as string | undefined) || "",
      role: normalizedRole,
    };
  } catch {
    return null;
  }
}

// ==================== 主 API 处理函数 ====================

/**
 * POST /api/tickets/[id]/workflow-action
 * 执行工单工作流动作
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  let pool: any = null;
  let transaction: any = null;

  try {
    // ==================== 1. 权限校验（第一行，遵守 cursorrules） ====================
    
    const cookieStore = cookies();
    const currentUser = await getCurrentUser(cookieStore);

    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: "未登录或登录已过期" },
        { status: 401 }
      );
    }

    // ==================== 2. 解析请求参数 ====================

    const body = await request.json().catch(() => ({}));
    const {
      action,
      currentStatus,
      userRole,
      signedReportPhoto, // 签字凭证照片路径（上传签字时使用）
    } = body;

    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params;

    const ticketId = resolvedParams?.id;

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "工单ID不能为空" },
        { status: 400 }
      );
    }

    if (!action || !currentStatus) {
      return NextResponse.json(
        { success: false, message: "缺少必要参数：action 或 currentStatus" },
        { status: 400 }
      );
    }

    // 归一化状态
    const normalizedCurrentStatus = normalizeTicketStatus(currentStatus);
    if (!normalizedCurrentStatus) {
      return NextResponse.json(
        { success: false, message: `无效的工单状态：${currentStatus}` },
        { status: 400 }
      );
    }

    // ==================== 3. 权限校验：检查用户是否有权执行该动作 ====================

    const hasPermission = canExecuteAction(
      action as TicketAction,
      normalizedCurrentStatus,
      currentUser.role
    );

    if (!hasPermission) {
      return NextResponse.json(
        {
          success: false,
          message: `您没有权限执行该操作（当前状态：${currentStatus}，您的角色：${currentUser.role}）`,
        },
        { status: 403 }
      );
    }

    // ==================== 4. 获取下一个状态 ====================

    const nextStatus = getNextStatusForAction(
      action as TicketAction,
      normalizedCurrentStatus
    );

    if (!nextStatus) {
      return NextResponse.json(
        { success: false, message: "无法确定下一个状态，操作失败" },
        { status: 400 }
      );
    }

    // ==================== 5. 开始数据库事务（遵守 cursorrules） ====================

    pool = await getDbConnection();
    transaction = pool.transaction();

    await transaction.begin();

    try {
      // ==================== 5.1 更新工单状态 ====================

      const updateRequest = transaction.request();
      updateRequest.input("ticketId", ticketId);
      updateRequest.input("newStatus", nextStatus);

      // 如果是上传签字动作，同时更新签字凭证字段
      if (action === TicketAction.UPLOAD_SIGNATURE && signedReportPhoto) {
        updateRequest.input("signedReportPhoto", signedReportPhoto);

        await updateRequest.query(`
          UPDATE [dbo].[Repair_Tickets]
          SET 
            [Status] = @newStatus,
            [SignedReportPhoto] = @signedReportPhoto,
            [UpdatedAt] = GETUTCDATE()
          WHERE [ID] = @ticketId
        `);
      } else {
        await updateRequest.query(`
          UPDATE [dbo].[Repair_Tickets]
          SET 
            [Status] = @newStatus,
            [UpdatedAt] = GETUTCDATE()
          WHERE [ID] = @ticketId
        `);
      }

      // ==================== 5.2 记录操作历史（审计日志，遵守 cursorrules） ====================

      const historyRequest = transaction.request();
      historyRequest.input("ticketId", ticketId);
      historyRequest.input("actionType", TicketActionType.STATUS_CHANGE);
      historyRequest.input("oldStatus", normalizedCurrentStatus);
      historyRequest.input("newStatus", nextStatus);
      historyRequest.input("operatorId", currentUser.id);
      // 优先使用真实姓名，回退到用户名（遵守 cursorrules §5 不硬编码用户）
      historyRequest.input("operatorName", currentUser.realName || currentUser.username);
      historyRequest.input(
        "actionDescription",
        `${TICKET_ACTION_LABELS[action as TicketAction]}`
      );

      await historyRequest.query(`
        IF OBJECT_ID('dbo.Repair_Ticket_History', 'U') IS NOT NULL
        BEGIN
          INSERT INTO [dbo].[Repair_Ticket_History] (
            TicketID, ActionType, OldStatus, NewStatus, 
            OperatorID, OperatorName, ActionDescription, CreatedAt
          )
          VALUES (
            @ticketId, @actionType, @oldStatus, @newStatus,
            @operatorId, @operatorName, @actionDescription, GETUTCDATE()
          )
        END
      `);

      // ==================== 5.3 提交事务 ====================

      await transaction.commit();

      // ==================== 6. 返回成功结果 ====================

      return NextResponse.json({
        success: true,
        message: `操作成功：${TICKET_ACTION_LABELS[action as TicketAction]}`,
        data: {
          ticketId,
          oldStatus: normalizedCurrentStatus,
          newStatus: nextStatus,
          action: action,
          operator: {
            id: currentUser.id,
            name: currentUser.username,
            role: currentUser.role,
          },
        },
      });
    } catch (transactionError: any) {
      // 事务执行失败，回滚
      console.error("[Workflow Action API] 事务执行失败:", transactionError);
      await transaction.rollback();
      throw transactionError;
    }
  } catch (error: any) {
    console.error("[Workflow Action API] 执行失败:", error);

    // 如果事务已开启但未提交，尝试回滚
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("[Workflow Action API] 事务回滚失败:", rollbackError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: "操作失败，请稍后重试",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    );
  } finally {
    // 关闭数据库连接
    if (pool) {
      try {
        await pool.close();
      } catch (closeError) {
        console.error("[Workflow Action API] 关闭数据库连接失败:", closeError);
      }
    }
  }
}
