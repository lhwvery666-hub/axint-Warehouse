import assert from "node:assert/strict"
import test from "node:test"
import { applyDeviceCheckResult } from "../device-check-state"

test("a successful SN lookup preserves changes to description, quantity, model and photos", () => {
  const current = { serialNumber: "SN-A", isSnPendingVerify: false, faultDescription: "new fault", quantity: 50, model: "new model", photos: ["blob:new"], snValid: false }
  assert.deepEqual(applyDeviceCheckResult(current, "SN-A", { snValid: true }), { ...current, snValid: true })
})
test("a response for a previous SN or unreadable label never overwrites current state", () => {
  const current = { serialNumber: "SN-B", isSnPendingVerify: false, snValid: false }
  assert.equal(applyDeviceCheckResult(current, "SN-A", { snValid: true }), current)
  const pending = { ...current, isSnPendingVerify: true }
  assert.equal(applyDeviceCheckResult(pending, "SN-B", { snValid: true }), pending)
})
