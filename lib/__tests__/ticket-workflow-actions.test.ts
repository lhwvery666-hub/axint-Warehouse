/**
 * 工单工作流动作单元测试
 * 测试状态流转规则、权限控制、动作执行逻辑
 */

import { describe, it } from "node:test";
import { expect } from "./test-helpers";
import { TicketStatus, UserRole } from "@/lib/enums";
import {
  TicketAction,
  WORKFLOW_TRANSITIONS,
  getAvailableAction,
  canExecuteAction,
  getTransitionForActionAndRole,
  getNextStatusForAction,
  requiresValidation,
} from "@/lib/ticket-workflow-actions";

describe("工单工作流动作系统", () => {
  // ==================== 测试工作流流转规则的完整性 ====================

  describe("WORKFLOW_TRANSITIONS 完整性检查", () => {
    it("应该包含所有核心状态的流转规则", () => {
      const coveredStatuses = new Set(
        WORKFLOW_TRANSITIONS.map((t) => t.currentStatus)
      );

      // 核心工作流状态
      // ⚠️ TECHNICIAN_REPAIRING 不在此列表中：该状态下的流转（提交处理结果 → 商务审核/
      // 仓库发货）已改由 POST /api/tickets/complete-repair-batch/[batchId] 处理，
      // 原来这里的 CONFIRM_SIGNATURE 死代码路径已被清理移除（见 ticket-workflow-actions.ts）。
      const coreStatuses = [
        TicketStatus.CREATED,
        TicketStatus.IN_REPAIR,
        TicketStatus.PENDING_REPORTER_CONFIRM,
        TicketStatus.BUSINESS_REVIEW,
        TicketStatus.WAREHOUSE_SHIPPING,
      ];

      coreStatuses.forEach((status) => {
        expect(coveredStatuses.has(status)).toBe(true);
      });
    });

    it("每个动作应该有唯一的（状态+角色）组合", () => {
      const keys = WORKFLOW_TRANSITIONS.map(
        (t) => `${t.currentStatus}_${t.allowedRole}`
      );
      const uniqueKeys = new Set(keys);

      expect(keys.length).toBe(uniqueKeys.size);
    });

    it("所有流转规则应该有明确的下一状态", () => {
      WORKFLOW_TRANSITIONS.forEach((transition) => {
        expect(transition.nextStatus).toBeTruthy();
        expect(typeof transition.nextStatus).toBe("string");
      });
    });
  });

  // ==================== 测试 getAvailableAction ====================

  describe("getAvailableAction", () => {
    it("应该返回仓库在 CREATED 状态下的可用动作", () => {
      const action = getAvailableAction(
        TicketStatus.CREATED,
        UserRole.WAREHOUSE
      );

      expect(action).not.toBeNull();
      expect(action?.action).toBe(TicketAction.CONFIRM_RECEIPT);
      expect(action?.nextStatus).toBe(TicketStatus.WAREHOUSE_CONFIRMED);
    });

    it("应该返回维修人员在 IN_REPAIR 状态下的可用动作", () => {
      const action = getAvailableAction(
        TicketStatus.IN_REPAIR,
        UserRole.TECHNICIAN
      );

      expect(action).not.toBeNull();
      expect(action?.action).toBe(TicketAction.SEND_REPORT_FOR_SIGN);
      expect(action?.nextStatus).toBe(TicketStatus.PENDING_REPORTER_CONFIRM);
    });

    it("应该返回现场人员在 PENDING_REPORTER_CONFIRM 状态下的可用动作", () => {
      const action = getAvailableAction(
        TicketStatus.PENDING_REPORTER_CONFIRM,
        UserRole.REPORTER
      );

      expect(action).not.toBeNull();
      expect(action?.action).toBe(TicketAction.UPLOAD_SIGNATURE);
      expect(action?.nextStatus).toBe(TicketStatus.TECHNICIAN_REPAIRING);
    });

    it("应该返回商务人员在 BUSINESS_REVIEW 状态下的可用动作", () => {
      const action = getAvailableAction(
        TicketStatus.BUSINESS_REVIEW,
        UserRole.BUSINESS
      );

      expect(action).not.toBeNull();
      expect(action?.action).toBe(TicketAction.CONFIRM_PAYMENT);
      expect(action?.nextStatus).toBe(TicketStatus.WAREHOUSE_SHIPPING);
    });

    it("应该在角色不匹配时返回 null", () => {
      // 现场人员不能在 CREATED 状态下操作
      const action = getAvailableAction(
        TicketStatus.CREATED,
        UserRole.REPORTER
      );

      expect(action).toBeNull();
    });

    it("应该在完成状态下返回 null", () => {
      const action = getAvailableAction(
        TicketStatus.COMPLETED,
        UserRole.WAREHOUSE
      );

      expect(action).toBeNull();
    });
  });

  // ==================== 测试 canExecuteAction ====================

  describe("canExecuteAction", () => {
    it("应该允许仓库在 CREATED 状态下确认收货", () => {
      const canExecute = canExecuteAction(
        TicketAction.CONFIRM_RECEIPT,
        TicketStatus.CREATED,
        UserRole.WAREHOUSE
      );

      expect(canExecute).toBe(true);
    });

    it("应该拒绝现场人员在 CREATED 状态下确认收货", () => {
      const canExecute = canExecuteAction(
        TicketAction.CONFIRM_RECEIPT,
        TicketStatus.CREATED,
        UserRole.REPORTER
      );

      expect(canExecute).toBe(false);
    });

    it("应该拒绝维修人员在错误的状态下发送报告", () => {
      // 在 CREATED 状态下不能发送报告
      const canExecute = canExecuteAction(
        TicketAction.SEND_REPORT_FOR_SIGN,
        TicketStatus.CREATED,
        UserRole.TECHNICIAN
      );

      expect(canExecute).toBe(false);
    });

    it("应该允许现场人员在 PENDING_REPORTER_CONFIRM 状态下上传签字", () => {
      const canExecute = canExecuteAction(
        TicketAction.UPLOAD_SIGNATURE,
        TicketStatus.PENDING_REPORTER_CONFIRM,
        UserRole.REPORTER
      );

      expect(canExecute).toBe(true);
    });
  });

  describe("getTransitionForActionAndRole", () => {
    it("应该从服务端动作与角色推导 expectedStatus，不依赖客户端状态", () => {
      const transition = getTransitionForActionAndRole(
        TicketAction.UPLOAD_SIGNATURE,
        UserRole.REPORTER
      );

      expect(transition?.currentStatus).toBe(TicketStatus.PENDING_REPORTER_CONFIRM);
      expect(transition?.nextStatus).toBe(TicketStatus.TECHNICIAN_REPAIRING);
    });

    it("应该拒绝动作与角色不匹配的组合", () => {
      const transition = getTransitionForActionAndRole(
        TicketAction.CONFIRM_PAYMENT,
        UserRole.REPORTER
      );

      expect(transition).toBeNull();
    });
  });

  // ==================== 测试 getNextStatusForAction ====================

  describe("getNextStatusForAction", () => {
    it("应该返回确认收货后的下一状态", () => {
      const nextStatus = getNextStatusForAction(
        TicketAction.CONFIRM_RECEIPT,
        TicketStatus.CREATED
      );

      expect(nextStatus).toBe(TicketStatus.WAREHOUSE_CONFIRMED);
    });

    it("应该返回发送报告后的下一状态", () => {
      const nextStatus = getNextStatusForAction(
        TicketAction.SEND_REPORT_FOR_SIGN,
        TicketStatus.IN_REPAIR
      );

      expect(nextStatus).toBe(TicketStatus.PENDING_REPORTER_CONFIRM);
    });

    it("应该返回上传签字后的下一状态", () => {
      const nextStatus = getNextStatusForAction(
        TicketAction.UPLOAD_SIGNATURE,
        TicketStatus.PENDING_REPORTER_CONFIRM
      );

      expect(nextStatus).toBe(TicketStatus.TECHNICIAN_REPAIRING);
    });

    it("应该在动作与状态不匹配时返回 null", () => {
      const nextStatus = getNextStatusForAction(
        TicketAction.CONFIRM_SHIPMENT,
        TicketStatus.CREATED
      );

      expect(nextStatus).toBeNull();
    });
  });

  // ==================== 测试 requiresValidation ====================

  describe("requiresValidation", () => {
    it("应该要求仓库确认收货时进行验证", () => {
      const needsValidation = requiresValidation(
        TicketAction.CONFIRM_RECEIPT,
        TicketStatus.CREATED
      );

      expect(needsValidation).toBe(true);
    });

    it("应该要求维修人员发送报告时进行验证", () => {
      const needsValidation = requiresValidation(
        TicketAction.SEND_REPORT_FOR_SIGN,
        TicketStatus.IN_REPAIR
      );

      expect(needsValidation).toBe(true);
    });

    it("应该不要求现场人员上传签字时进行验证", () => {
      const needsValidation = requiresValidation(
        TicketAction.UPLOAD_SIGNATURE,
        TicketStatus.PENDING_REPORTER_CONFIRM
      );

      expect(needsValidation).toBe(false);
    });

    it("应该不要求商务确认收费时进行验证", () => {
      const needsValidation = requiresValidation(
        TicketAction.CONFIRM_PAYMENT,
        TicketStatus.BUSINESS_REVIEW
      );

      expect(needsValidation).toBe(false);
    });
  });

  // ==================== 测试完整工作流闭环 ====================

  describe("完整工作流闭环测试", () => {
    it("应该能够完整走完一个工单的生命周期", () => {
      // 1. 仓库确认收货
      const step1 = getAvailableAction(TicketStatus.CREATED, UserRole.WAREHOUSE);
      expect(step1?.action).toBe(TicketAction.CONFIRM_RECEIPT);
      expect(step1?.nextStatus).toBe(TicketStatus.WAREHOUSE_CONFIRMED);

      // 2. 维修检查（假设自动流转到 IN_REPAIR）

      // 3. 维修人员发送报告
      const step3 = getAvailableAction(TicketStatus.IN_REPAIR, UserRole.TECHNICIAN);
      expect(step3?.action).toBe(TicketAction.SEND_REPORT_FOR_SIGN);
      expect(step3?.nextStatus).toBe(TicketStatus.PENDING_REPORTER_CONFIRM);

      // 4. 现场人员上传签字
      const step4 = getAvailableAction(
        TicketStatus.PENDING_REPORTER_CONFIRM,
        UserRole.REPORTER
      );
      expect(step4?.action).toBe(TicketAction.UPLOAD_SIGNATURE);
      expect(step4?.nextStatus).toBe(TicketStatus.TECHNICIAN_REPAIRING);

      // 5. 维修作业中阶段：不再由 WORKFLOW_TRANSITIONS 提供"一步转交商务"的动作
      // （原 CONFIRM_SIGNATURE 死代码路径已移除），真正的完工提交走
      // POST /api/tickets/complete-repair-batch/[batchId]，此处只验证
      // 通用流转表里确实已经没有这条可能导致跳步的规则。
      const step5 = getAvailableAction(
        TicketStatus.TECHNICIAN_REPAIRING,
        UserRole.TECHNICIAN
      );
      expect(step5).toBeNull();

      // 6. 商务确认收费
      const step6 = getAvailableAction(
        TicketStatus.BUSINESS_REVIEW,
        UserRole.BUSINESS
      );
      expect(step6?.action).toBe(TicketAction.CONFIRM_PAYMENT);
      expect(step6?.nextStatus).toBe(TicketStatus.WAREHOUSE_SHIPPING);

      // 7. 仓库发货
      const step7 = getAvailableAction(
        TicketStatus.WAREHOUSE_SHIPPING,
        UserRole.WAREHOUSE
      );
      expect(step7?.action).toBe(TicketAction.CONFIRM_SHIPMENT);
      expect(step7?.nextStatus).toBe(TicketStatus.COMPLETED);

      // 8. 完成后无可用动作
      const step8 = getAvailableAction(TicketStatus.COMPLETED, UserRole.WAREHOUSE);
      expect(step8).toBeNull();
    });
  });
});
