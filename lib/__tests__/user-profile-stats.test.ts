import assert from "node:assert/strict"
import test from "node:test"
import { UserRole } from "../enums"
import { buildUserProfileStats } from "../user-profile-stats"

const repairs = [
  { id: "1", batchId: "B-1", status: "warehouse_confirming" },
  { id: "2", batchId: "B-1", status: "warehouse_confirming" },
  { id: "3", batchId: "B-2", status: "pending_factory" },
  { id: "4", batchId: "B-3", status: "completed" },
  { id: "5", batchId: "B-4", status: "cancelled" },
]

test("个人中心统计按批次去重，避免多设备重复计算工单", () => {
  const stats = buildUserProfileStats(UserRole.ADMIN, repairs)
  assert.equal(stats.find((item) => item.label === "全部工单")?.value, 4)
  assert.equal(stats.find((item) => item.label === "进行中")?.value, 2)
  assert.equal(stats.find((item) => item.label === "已完成")?.value, 1)
  assert.equal(stats.find((item) => item.label === "异常结束")?.value, 1)
})

test("仓库统计把待返厂和待仓库发货归入待处理发货", () => {
  const stats = buildUserProfileStats(UserRole.WAREHOUSE, [
    ...repairs,
    { id: "6", batchId: "B-5", status: "warehouse_shipping" },
  ])
  assert.equal(stats.find((item) => item.label === "待仓库确认")?.value, 1)
  assert.equal(stats.find((item) => item.label === "待处理发货")?.value, 2)
})

test("现场与商务只展示各自需要关注的工作指标", () => {
  const reporter = buildUserProfileStats(UserRole.REPORTER, [
    { id: "1", status: "pending_reporter_confirm" },
  ])
  const business = buildUserProfileStats(UserRole.BUSINESS, [
    { id: "2", status: "business_review" },
    { id: "3", status: "pending_payment" },
  ])

  assert.equal(reporter.find((item) => item.label === "待我确认")?.value, 1)
  assert.equal(business.find((item) => item.label === "待商务审核")?.value, 2)
})
