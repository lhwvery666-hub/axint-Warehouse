import assert from "node:assert/strict"
import test from "node:test"
import { BatchDeviceReconciliationError, planBatchDeviceReconciliation } from "../batch-device-reconciliation"

test("reordered stable IDs retain identity", () => {
  const plan = planBatchDeviceReconciliation([20, 21], [{ deviceId: 21 }, { deviceId: 20 }], { expectedDeviceIds: [20, 21] })
  assert.deepEqual(plan.updates, [{ submittedIndex: 0, deviceId: 21 }, { submittedIndex: 1, deviceId: 20 }])
  assert.deepEqual(plan.deletes, [])
})
test("a stale form cannot delete a device another operator added", () => {
  assert.throws(() => planBatchDeviceReconciliation([20, 21, 22], [{ deviceId: 20 }, { deviceId: 21 }], { expectedDeviceIds: [20, 21] }),
    (error) => error instanceof BatchDeviceReconciliationError && error.code === "STALE_DEVICE_LIST")
})
test("a concurrent deletion or replacement also invalidates the snapshot", () => {
  for (const existing of [[20], [20, 22]]) {
    assert.throws(() => planBatchDeviceReconciliation(existing, [{ deviceId: 20 }], { expectedDeviceIds: [20, 21], deletedDeviceIds: [21] }),
      (error) => error instanceof BatchDeviceReconciliationError && error.code === "STALE_DEVICE_LIST")
  }
})
test("omitted devices are preserved; only explicit deletions remove rows", () => {
  assert.deepEqual(planBatchDeviceReconciliation([20, 21], [{ deviceId: 21 }], { expectedDeviceIds: [20, 21] }).deletes, [])
  const plan = planBatchDeviceReconciliation([20, 21], [{ deviceId: 21 }, {}], { expectedDeviceIds: [20, 21], deletedDeviceIds: [20] })
  assert.deepEqual(plan.deletes, [20])
  assert.deepEqual(plan.inserts, [1])
})
test("unknown, duplicate, or simultaneously retained and deleted IDs fail", () => {
  for (const submitted of [[{ deviceId: 999 }], [{ deviceId: 20 }, { deviceId: 20 }]]) {
    assert.throws(() => planBatchDeviceReconciliation([20], submitted, { expectedDeviceIds: [20] }), BatchDeviceReconciliationError)
  }
  assert.throws(() => planBatchDeviceReconciliation([20], [{ deviceId: 20 }], { expectedDeviceIds: [20], deletedDeviceIds: [20] }), BatchDeviceReconciliationError)
})
test("an edit replacing every row creates new identities instead of overwriting by order", () => {
  const plan = planBatchDeviceReconciliation([20, 21], [{}], { expectedDeviceIds: [20, 21], deletedDeviceIds: [20, 21] })
  assert.deepEqual(plan.updates, [])
  assert.deepEqual(plan.inserts, [0])
  assert.deepEqual(plan.deletes, [20, 21])
})
