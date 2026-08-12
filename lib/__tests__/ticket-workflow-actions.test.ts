import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expect } from "./test-helpers";
import { TicketStatus, UserRole } from "@/lib/enums";
import {
  TicketAction,
  WORKFLOW_TRANSITIONS,
  canExecuteAction,
  getAvailableActions,
  getNextStatusForAction,
  getTransitionsForActionAndRole,
  requiresValidation,
} from "@/lib/ticket-workflow-actions";

describe("工单工作流动作", () => {
  it("每条规则的状态、角色和动作组合应唯一", () => {
    const keys = WORKFLOW_TRANSITIONS.map(
      (transition) =>
        `${transition.currentStatus}_${transition.allowedRole}_${transition.action}`
    );
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("维修检查中只能发送报告，不能在现场签字前正式申请返厂", () => {
    const actions = getAvailableActions(
      TicketStatus.IN_REPAIR,
      UserRole.TECHNICIAN
    );
    assert.deepEqual(actions.map((item) => item.action), [
      TicketAction.SEND_REPORT_FOR_SIGN,
    ]);
  });

  it("单设备返厂申请仅允许从现场签字后的维修作业中进入待返厂", () => {
    const transitions = getTransitionsForActionAndRole(
      TicketAction.REQUEST_FACTORY_REPAIR,
      UserRole.TECHNICIAN
    );
    assert.deepEqual(transitions.map((item) => item.currentStatus), [
      TicketStatus.TECHNICIAN_REPAIRING,
    ]);
    expect(
      transitions.every((item) => item.nextStatus === TicketStatus.PENDING_FACTORY)
    ).toBe(true);
  });

  it("管理员也只能从现场签字后的维修作业中发起单设备返厂", () => {
    const transitions = getTransitionsForActionAndRole(
      TicketAction.REQUEST_FACTORY_REPAIR,
      UserRole.ADMIN
    );
    expect(transitions.length).toBe(1);
    expect(transitions[0]?.currentStatus).toBe(TicketStatus.TECHNICIAN_REPAIRING);
    expect(
      transitions.every((item) => item.nextStatus === TicketStatus.PENDING_FACTORY)
    ).toBe(true);
  });

  it("返厂设备返回必须走仓库单设备移交接口，通用整批动作不可用", () => {
    for (const role of [
      UserRole.ADMIN,
      UserRole.BUSINESS,
      UserRole.TECHNICIAN,
      UserRole.WAREHOUSE,
    ]) {
      const transitions = getTransitionsForActionAndRole(
        TicketAction.CONFIRM_FACTORY_RETURN,
        role
      );
      expect(transitions.length).toBe(0);
      expect(
        canExecuteAction(
          TicketAction.CONFIRM_FACTORY_RETURN,
          TicketStatus.PENDING_FACTORY,
          role
        )
      ).toBe(false);
    }
  });

  it("未授权角色不能执行返厂动作", () => {
    expect(
      canExecuteAction(
        TicketAction.REQUEST_FACTORY_REPAIR,
        TicketStatus.IN_REPAIR,
        UserRole.BUSINESS
      )
    ).toBe(false);
    expect(
      canExecuteAction(
        TicketAction.CONFIRM_FACTORY_RETURN,
        TicketStatus.PENDING_FACTORY,
        UserRole.TECHNICIAN
      )
    ).toBe(false);
  });

  it("返厂申请需要返厂资料校验", () => {
    expect(
      requiresValidation(
        TicketAction.REQUEST_FACTORY_REPAIR,
        TicketStatus.TECHNICIAN_REPAIRING
      )
    ).toBe(true);
  });

  it("仓库发送后直接进入维修检查，不产生仓库已确认中间状态", () => {
    expect(
      getNextStatusForAction(
        TicketAction.CONFIRM_RECEIPT,
        TicketStatus.WAREHOUSE_CONFIRMING
      )
    ).toBe(TicketStatus.IN_REPAIR);
    expect(
      getNextStatusForAction(
        TicketAction.UPLOAD_SIGNATURE,
        TicketStatus.PENDING_REPORTER_CONFIRM
      )
    ).toBe(TicketStatus.TECHNICIAN_REPAIRING);
    expect(
      getNextStatusForAction(
        TicketAction.CONFIRM_SHIPMENT,
        TicketStatus.WAREHOUSE_CONFIRMING
      )
    ).toBeNull();
  });

  it("维修报告发送仅支持维修检查和历史仓库确认状态，且整批进入待现场确认", () => {
    for (const role of [UserRole.TECHNICIAN, UserRole.ADMIN]) {
      const transitions = getTransitionsForActionAndRole(
        TicketAction.SEND_REPORT_FOR_SIGN,
        role
      );
      assert.deepEqual(transitions.map((item) => item.currentStatus), [
        TicketStatus.IN_REPAIR,
        TicketStatus.WAREHOUSE_CONFIRMED,
      ]);
      expect(
        transitions.every((item) => item.nextStatus === TicketStatus.PENDING_REPORTER_CONFIRM)
      ).toBe(true);
    }
  });

  it("完成状态下没有可执行动作", () => {
    assert.deepEqual(
      getAvailableActions(TicketStatus.COMPLETED, UserRole.WAREHOUSE),
      []
    );
  });
});
