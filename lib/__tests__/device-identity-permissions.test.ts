import assert from "node:assert/strict"
import test from "node:test"

import {
  canEditDeviceClassification,
  canEditDeviceIdentity,
} from "@/lib/device-identity-permissions"
import { TicketStatus, UserRole } from "@/lib/enums"

test("仓库只能在收货确认阶段修改产品名称和型号", () => {
  assert.equal(canEditDeviceIdentity(UserRole.WAREHOUSE, TicketStatus.CREATED), true)
  assert.equal(canEditDeviceIdentity(UserRole.WAREHOUSE, TicketStatus.WAREHOUSE_CONFIRMING), true)
  assert.equal(canEditDeviceIdentity(UserRole.WAREHOUSE, TicketStatus.WAREHOUSE_CONFIRMED), true)
  assert.equal(canEditDeviceIdentity(UserRole.WAREHOUSE, TicketStatus.IN_REPAIR), false)
})

test("维修工程师只能在检测和维修阶段修改产品名称和型号", () => {
  assert.equal(canEditDeviceIdentity(UserRole.TECHNICIAN, TicketStatus.WAREHOUSE_CONFIRMED), true)
  assert.equal(canEditDeviceIdentity(UserRole.TECHNICIAN, TicketStatus.IN_REPAIR), true)
  assert.equal(canEditDeviceIdentity(UserRole.TECHNICIAN, TicketStatus.TECHNICIAN_REPAIRING), true)
  assert.equal(canEditDeviceIdentity(UserRole.TECHNICIAN, TicketStatus.BUSINESS_REVIEW), false)
})

test("现场、商务和管理员不通过这个受限入口修改设备身份信息", () => {
  assert.equal(canEditDeviceIdentity(UserRole.REPORTER, TicketStatus.CREATED), false)
  assert.equal(canEditDeviceIdentity(UserRole.BUSINESS, TicketStatus.IN_REPAIR), false)
  assert.equal(canEditDeviceIdentity(UserRole.ADMIN, TicketStatus.IN_REPAIR), false)
})

test("兼容数据库中的小写状态值", () => {
  assert.equal(canEditDeviceIdentity(UserRole.TECHNICIAN, "technician_repairing"), true)
})

test("只有仓库能在收货确认阶段完善三级分类", () => {
  assert.equal(canEditDeviceClassification(UserRole.WAREHOUSE, TicketStatus.CREATED), true)
  assert.equal(canEditDeviceClassification(UserRole.WAREHOUSE, TicketStatus.WAREHOUSE_CONFIRMING), true)
  assert.equal(canEditDeviceClassification(UserRole.WAREHOUSE, TicketStatus.WAREHOUSE_CONFIRMED), true)
  assert.equal(canEditDeviceClassification(UserRole.WAREHOUSE, TicketStatus.IN_REPAIR), false)
  assert.equal(canEditDeviceClassification(UserRole.TECHNICIAN, TicketStatus.IN_REPAIR), false)
  assert.equal(canEditDeviceClassification(UserRole.REPORTER, TicketStatus.CREATED), false)
})
