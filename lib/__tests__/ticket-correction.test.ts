import assert from "node:assert/strict"
import test from "node:test"
import {
  CORRECTION_IMPACT,
  canReporterEditDirectly,
  correctionHistoryKey,
  correctionValueEquals,
  getCorrectionRollbackTarget,
  getHighestCorrectionImpact,
  isCorrectionTerminalStatus,
} from "@/lib/ticket-correction"
import { TicketStatus } from "@/lib/enums"

test("现场人员只有在仓库确认前可以直接编辑", () => {
  assert.equal(canReporterEditDirectly(TicketStatus.CREATED), true)
  assert.equal(canReporterEditDirectly(TicketStatus.WAREHOUSE_CONFIRMING), true)
  assert.equal(canReporterEditDirectly(TicketStatus.IN_REPAIR), false)
  assert.equal(canReporterEditDirectly(TicketStatus.COMPLETED), false)
})

test("混合影响的修改采用最早的必要回退节点", () => {
  const impact = getHighestCorrectionImpact([
    { scope: "batch", field: "contactInfo", label: "联系信息", oldValue: "a", newValue: "b", impact: CORRECTION_IMPACT.NONE },
    { scope: "device", deviceId: 1, field: "faultDescription", label: "故障描述", oldValue: "a", newValue: "b", impact: CORRECTION_IMPACT.REPAIR_REVIEW },
    { scope: "device", deviceId: 1, field: "modelName", label: "产品型号", oldValue: "a", newValue: "b", impact: CORRECTION_IMPACT.WAREHOUSE_REVIEW },
  ])

  assert.equal(impact, CORRECTION_IMPACT.WAREHOUSE_REVIEW)
  assert.equal(getCorrectionRollbackTarget(impact), TicketStatus.WAREHOUSE_CONFIRMING)
  assert.equal(getCorrectionRollbackTarget(CORRECTION_IMPACT.REPAIR_REVIEW), TicketStatus.IN_REPAIR)
  assert.equal(getCorrectionRollbackTarget(CORRECTION_IMPACT.NONE), null)
})

test("现场人员不能对已结束工单发起修改申请", () => {
  assert.equal(isCorrectionTerminalStatus(TicketStatus.COMPLETED), true)
  assert.equal(isCorrectionTerminalStatus(TicketStatus.CANCELLED), true)
  assert.equal(isCorrectionTerminalStatus(TicketStatus.IN_REPAIR), false)
})

test("空值比较和修改申请日志键保持稳定", () => {
  assert.equal(correctionValueEquals(null, ""), true)
  assert.equal(correctionValueEquals("  AX-7CW ", "AX-7CW"), true)
  assert.equal(correctionValueEquals(3, "3"), true)
  assert.equal(correctionHistoryKey(42), "CORR:42")
})
