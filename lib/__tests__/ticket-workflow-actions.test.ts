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

  it("维修人员在维修检查中可同时发送报告或申请返厂", () => {
    const actions = getAvailableActions(
      TicketStatus.IN_REPAIR,
      UserRole.TECHNICIAN
    );
    assert.deepEqual(actions.map((item) => item.action), [
      TicketAction.SEND_REPORT_FOR_SIGN,
      TicketAction.REQUEST_FACTORY_REPAIR,
    ]);
  });

  it("整批返厂申请允许两个源状态并统一进入待返厂", () => {
    const transitions = getTransitionsForActionAndRole(
      TicketAction.REQUEST_FACTORY_REPAIR,
      UserRole.TECHNICIAN
    );
    assert.deepEqual(transitions.map((item) => item.currentStatus), [
      TicketStatus.IN_REPAIR,
      TicketStatus.TECHNICIAN_REPAIRING,
    ]);
    expect(
      transitions.every((item) => item.nextStatus === TicketStatus.PENDING_FACTORY)
    ).toBe(true);
  });

  it("管理员也可从两个维修状态发起整批返厂", () => {
    const transitions = getTransitionsForActionAndRole(
      TicketAction.REQUEST_FACTORY_REPAIR,
      UserRole.ADMIN
    );
    expect(transitions.length).toBe(2);
    expect(
      transitions.every((item) => item.nextStatus === TicketStatus.PENDING_FACTORY)
    ).toBe(true);
  });

  it("管理员和商务可确认整批原厂返修完成", () => {
    for (const role of [UserRole.ADMIN, UserRole.BUSINESS]) {
      const transitions = getTransitionsForActionAndRole(
        TicketAction.CONFIRM_FACTORY_RETURN,
        role
      );
      expect(transitions.length).toBe(1);
      expect(transitions[0].currentStatus).toBe(TicketStatus.PENDING_FACTORY);
      expect(transitions[0].nextStatus).toBe(TicketStatus.FACTORY_FINISHED);
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
        TicketStatus.IN_REPAIR
      )
    ).toBe(true);
  });

  it("现有标准工作流动作保持不变", () => {
    expect(
      getNextStatusForAction(
        TicketAction.CONFIRM_RECEIPT,
        TicketStatus.CREATED
      )
    ).toBe(TicketStatus.WAREHOUSE_CONFIRMED);
    expect(
      getNextStatusForAction(
        TicketAction.UPLOAD_SIGNATURE,
        TicketStatus.PENDING_REPORTER_CONFIRM
      )
    ).toBe(TicketStatus.TECHNICIAN_REPAIRING);
    expect(
      getNextStatusForAction(
        TicketAction.CONFIRM_SHIPMENT,
        TicketStatus.CREATED
      )
    ).toBeNull();
  });

  it("完成状态下没有可执行动作", () => {
    assert.deepEqual(
      getAvailableActions(TicketStatus.COMPLETED, UserRole.WAREHOUSE),
      []
    );
  });
});
