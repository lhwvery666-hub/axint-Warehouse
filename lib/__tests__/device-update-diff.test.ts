import assert from "node:assert/strict"
import test from "node:test"

import {
  getChangedDeviceUpdates,
  type DeviceUpdateSnapshot,
} from "@/lib/device-update-diff"

const snapshot: DeviceUpdateSnapshot = {
  deviceSn: "SN-001",
  modelName: "KF100",
  deviceName: "网络控制板-常用",
  faultDescription: "无法启动",
  category: "开关配件",
  subCategory: "开关",
  materialCode: "1201",
  quantity: 1,
  manufactureDate: new Date("2026-08-01T00:00:00.000Z"),
  arrivalDate: new Date("2026-08-02T00:00:00.000Z"),
}

test("相同内容不会被识别为修改", () => {
  assert.deepEqual(getChangedDeviceUpdates({
    deviceName: " 网络控制板-常用 ",
    modelName: "KF100",
    category: "开关配件",
    subCategory: "开关",
    manufactureDate: "2026-08-01T00:00:00.000Z",
    arrivalDate: "2026-08-02T08:00:00.000+08:00",
  }, snapshot), {})
})

test("只返回真正发生变化的字段", () => {
  assert.deepEqual(getChangedDeviceUpdates({
    deviceName: "网络控制板-常用",
    modelName: "KF102",
    category: "控制器",
    subCategory: "开关",
  }, snapshot), {
    modelName: "KF102",
    category: "控制器",
  })
})

test("清空可空字段会被识别为修改", () => {
  assert.deepEqual(getChangedDeviceUpdates({ materialCode: null }, snapshot), {
    materialCode: null,
  })
})
