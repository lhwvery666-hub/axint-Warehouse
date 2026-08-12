import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  RepairAction,
  TicketActionType,
  TicketStatus,
  UserRole,
} from "@/lib/enums"
import {
  canViewFactoryDetails,
  getVisibleRepairAction,
  getVisibleTicketStatus,
  isFactoryHistoryAction,
} from "@/lib/ticket-visibility"

describe("现场人员返厂信息隔离", () => {
  it("将待返厂和待复检统一显示为维修中", () => {
    assert.equal(
      getVisibleTicketStatus(TicketStatus.PENDING_FACTORY, UserRole.REPORTER),
      TicketStatus.TECHNICIAN_REPAIRING
    )
    assert.equal(
      getVisibleTicketStatus(TicketStatus.FACTORY_FINISHED, UserRole.REPORTER),
      TicketStatus.TECHNICIAN_REPAIRING
    )
  })

  it("内部角色仍能看到真实返厂状态", () => {
    assert.equal(
      getVisibleTicketStatus(TicketStatus.PENDING_FACTORY, UserRole.TECHNICIAN),
      TicketStatus.PENDING_FACTORY
    )
    assert.equal(
      getVisibleTicketStatus(TicketStatus.FACTORY_FINISHED, UserRole.WAREHOUSE),
      TicketStatus.FACTORY_FINISHED
    )
  })

  it("隐藏现场人员的返厂动作、字段权限和返厂历史", () => {
    assert.equal(getVisibleRepairAction(RepairAction.RMA, UserRole.REPORTER), null)
    assert.equal(getVisibleRepairAction(RepairAction.RMA, UserRole.TECHNICIAN), RepairAction.RMA)
    assert.equal(canViewFactoryDetails(UserRole.REPORTER), false)
    assert.equal(canViewFactoryDetails(UserRole.BUSINESS), true)
    assert.equal(isFactoryHistoryAction(TicketActionType.RMA_REQUEST), true)
    assert.equal(isFactoryHistoryAction(TicketActionType.FACTORY_RETURN_CONFIRMED), true)
  })
})
