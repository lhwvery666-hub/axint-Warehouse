import assert from "node:assert/strict"
import test from "node:test"
import { UserRole } from "../enums"
import { canAccessUserResource } from "../user-profile-policy"

test("普通角色只能访问自己的个人资料", () => {
  for (const role of [
    UserRole.REPORTER,
    UserRole.TECHNICIAN,
    UserRole.BUSINESS,
    UserRole.WAREHOUSE,
  ]) {
    assert.equal(canAccessUserResource(7, role, 7), true)
    assert.equal(canAccessUserResource(7, role, 8), false)
  }
})

test("管理员可以访问其他用户资料", () => {
  assert.equal(canAccessUserResource(1, UserRole.ADMIN, 8), true)
})
