import assert from "node:assert/strict"
import test from "node:test"
import { preserveBatchDeviceFields } from "../batch-device-fields"
const existing = { sn: "ABC", modelName: "Model-1", quantity: 50, deviceName: "internal name", faultDescription: "failure", materialCode: "MAT" }
test("a photo-only retry preserves all device and quantity fields", () => {
  assert.deepEqual(preserveBatchDeviceFields({ deviceId: 1, deviceImages: [] }, existing), {
    serialNumber: "ABC", modelName: "Model-1", quantity: 50, deviceName: "internal name", faultDescription: "failure", materialCode: "MAT", deviceId: 1, deviceImages: [],
  })
})
test("redacted internal fields omitted by a reporter do not erase saved information", () => {
  const result = preserveBatchDeviceFields({ serialNumber: "ABC", quantity: 3 }, existing)
  assert.equal(result.deviceName, "internal name")
  assert.equal(result.materialCode, "MAT")
  assert.equal(result.quantity, 3)
})
