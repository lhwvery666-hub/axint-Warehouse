import assert from "node:assert/strict"
import test from "node:test"
import {
  BatchDeviceReconciliationError,
  planBatchDeviceReconciliation,
} from "../batch-device-reconciliation"

test("stable IDs keep existing devices matched even after rows are reordered", () => {
  const plan = planBatchDeviceReconciliation(
    [1208, 1209],
    [{ deviceId: 1209 }, { deviceId: 1208 }],
  )

  assert.equal(plan.mode, "stable-id")
  assert.deepEqual(plan.updates, [
    { submittedIndex: 0, deviceId: 1209 },
    { submittedIndex: 1, deviceId: 1208 },
  ])
  assert.deepEqual(plan.inserts, [])
  assert.deepEqual(plan.deletes, [])
})

test("stable IDs distinguish additions and removals", () => {
  const plan = planBatchDeviceReconciliation(
    [1208, 1209],
    [{ deviceId: 1209 }, {}],
  )

  assert.deepEqual(plan.updates, [{ submittedIndex: 0, deviceId: 1209 }])
  assert.deepEqual(plan.inserts, [1])
  assert.deepEqual(plan.deletes, [1208])
})

test("unknown and duplicate IDs are rejected instead of updating another row", () => {
  assert.throws(
    () => planBatchDeviceReconciliation([1208], [{ deviceId: 9999 }]),
    (error) => error instanceof BatchDeviceReconciliationError
      && error.code === "UNKNOWN_DEVICE_ID",
  )
  assert.throws(
    () => planBatchDeviceReconciliation([1208], [{ deviceId: 1208 }, { deviceId: 1208 }]),
    (error) => error instanceof BatchDeviceReconciliationError
      && error.code === "DUPLICATE_DEVICE_ID",
  )
})

test("legacy post-create photo sync keeps the original ordered fallback", () => {
  const plan = planBatchDeviceReconciliation([20, 21], [{}, {}])

  assert.equal(plan.mode, "legacy-order")
  assert.deepEqual(plan.updates, [
    { submittedIndex: 0, deviceId: 20 },
    { submittedIndex: 1, deviceId: 21 },
  ])
})
