import assert from "node:assert/strict"
import test from "node:test"

import { TicketStatus } from "../enums"
import {
  ALL_REPAIR_STATUS_FILTER,
  matchesFinancialFollowupFilters,
  matchesRepairListFilters,
  matchesRepairSummaryFilter,
  matchesRepairTimeRange,
  parseRepairSummaryFilter,
  REPAIR_SUMMARY_FILTER,
  type RepairListFilterRecord,
  type RepairListFilters,
} from "../repair-list-filters"

const task: RepairListFilterRecord = {
  id: "101",
  batchId: "WO2607280001",
  customerName: "安科客户",
  projectName: "广州前台项目",
  reportedBy: "刘浩威",
  reportedByUsername: "liuhaowei",
  status: "technician_repairing",
  devices: [
    {
      id: "101",
      workOrderNumber: "DEVICE-WO-001",
      deviceSerialNumber: "N76J2584",
      productSN: "AX-7CW-001",
      deviceModel: "AX-7CW",
      deviceName: "网络控制板",
    },
    {
      id: "102",
      workOrderNumber: "DEVICE-WO-002",
      deviceSerialNumber: "NESTED-SN-999",
      productSN: "AX-7CW-002",
      deviceModel: "AX-9PRO",
      deviceName: "扩展控制板",
    },
  ],
}

function createFilters(overrides: Partial<RepairListFilters> = {}): RepairListFilters {
  return {
    workOrderQuery: "",
    customerQuery: "",
    deviceQuery: "",
    status: ALL_REPAIR_STATUS_FILTER,
    ...overrides,
  }
}

test("empty filters match a task", () => {
  assert.equal(matchesRepairListFilters(task, createFilters()), true)
})

test("work order search matches the batch number and nested work order", () => {
  assert.equal(
    matchesRepairListFilters(task, createFilters({ workOrderQuery: "2607280001" })),
    true,
  )
  assert.equal(
    matchesRepairListFilters(task, createFilters({ workOrderQuery: "device-wo-002" })),
    true,
  )
})

test("customer search matches customer, reporter display name, and username", () => {
  assert.equal(
    matchesRepairListFilters(task, createFilters({ customerQuery: "安科" })),
    true,
  )
  assert.equal(
    matchesRepairListFilters(task, createFilters({ customerQuery: "刘浩" })),
    true,
  )
  assert.equal(
    matchesRepairListFilters(task, createFilters({ customerQuery: "LIUHAOWEI" })),
    true,
  )
})

test("device search matches a nested device SN and model", () => {
  assert.equal(
    matchesRepairListFilters(task, createFilters({ deviceQuery: "nested-sn-999" })),
    true,
  )
  assert.equal(
    matchesRepairListFilters(task, createFilters({ deviceQuery: "ax-9pro" })),
    true,
  )
})

test("device search matches pre-aggregated batch serials and models", () => {
  const aggregatedBatch: RepairListFilterRecord = {
    batchId: "WO-BATCH-AGG",
    deviceSerials: "SN-001|SN-002|SN-003",
    deviceModels: "AX-7CW|AX-9PRO",
    status: TicketStatus.COMPLETED,
  }

  assert.equal(
    matchesRepairListFilters(aggregatedBatch, createFilters({ deviceQuery: "SN-002" })),
    true,
  )
  assert.equal(
    matchesRepairListFilters(aggregatedBatch, createFilters({ deviceQuery: "AX-9PRO" })),
    true,
  )
})

test("status search normalizes backend status values", () => {
  assert.equal(
    matchesRepairListFilters(task, createFilters({ status: TicketStatus.TECHNICIAN_REPAIRING })),
    true,
  )
  assert.equal(
    matchesRepairListFilters(task, createFilters({ status: TicketStatus.COMPLETED })),
    false,
  )
})

test("status search matches any status aggregated inside a batch", () => {
  const mixedStatusBatch: RepairListFilterRecord = {
    batchId: "WO-MIXED-STATUS",
    status: TicketStatus.COMPLETED,
    statuses: "Completed|Warehouse_Shipping|Business_Review",
  }

  assert.equal(
    matchesRepairListFilters(
      mixedStatusBatch,
      createFilters({ status: TicketStatus.WAREHOUSE_SHIPPING }),
    ),
    true,
  )
})

test("summary cards normalize pending and active workflow statuses", () => {
  assert.equal(
    matchesRepairSummaryFilter(
      { status: "created" },
      REPAIR_SUMMARY_FILTER.PENDING,
    ),
    true,
  )
  assert.equal(
    matchesRepairSummaryFilter(
      { status: TicketStatus.WAREHOUSE_CONFIRMED },
      REPAIR_SUMMARY_FILTER.ACTIVE,
    ),
    true,
  )
  assert.equal(
    matchesRepairSummaryFilter(
      { status: "technician_repairing" },
      REPAIR_SUMMARY_FILTER.ACTIVE,
    ),
    true,
  )
  assert.equal(
    matchesRepairSummaryFilter(
      { status: TicketStatus.DELAYED },
      REPAIR_SUMMARY_FILTER.ACTIVE,
    ),
    true,
  )
})

test("retired warehouse-confirmed and delayed values are never shown as standalone workflow groups", () => {
  assert.equal(
    matchesRepairSummaryFilter(
      { status: TicketStatus.WAREHOUSE_CONFIRMED },
      REPAIR_SUMMARY_FILTER.PENDING,
    ),
    false,
  )
  assert.equal(
    matchesRepairSummaryFilter(
      { status: TicketStatus.DELAYED },
      REPAIR_SUMMARY_FILTER.ACTIVE,
    ),
    true,
  )
})

test("summary cards use nested status only when a batch lacks a top-level status", () => {
  const batch: RepairListFilterRecord = {
    batchId: "WO-SUMMARY",
    devices: [
      { status: TicketStatus.COMPLETED },
    ],
  }

  assert.equal(
    matchesRepairSummaryFilter(batch, REPAIR_SUMMARY_FILTER.COMPLETED),
    true,
  )
  assert.equal(
    matchesRepairSummaryFilter(batch, REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING),
    false,
  )

  const mixedBatch: RepairListFilterRecord = {
    ...batch,
    status: TicketStatus.CREATED,
  }
  assert.equal(
    matchesRepairSummaryFilter(mixedBatch, REPAIR_SUMMARY_FILTER.PENDING),
    true,
  )
  assert.equal(
    matchesRepairSummaryFilter(mixedBatch, REPAIR_SUMMARY_FILTER.COMPLETED),
    false,
  )
})

test("business review and warehouse shipping share one follow-up summary card", () => {
  assert.equal(
    matchesRepairSummaryFilter(
      { status: TicketStatus.BUSINESS_REVIEW },
      REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING,
    ),
    true,
  )
  assert.equal(
    matchesRepairSummaryFilter(
      { status: TicketStatus.WAREHOUSE_SHIPPING },
      REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING,
    ),
    true,
  )
  assert.equal(
    matchesRepairSummaryFilter(
      { status: TicketStatus.BUSINESS_REVIEW },
      REPAIR_SUMMARY_FILTER.ACTIVE,
    ),
    false,
  )
})

test("summary filter query parameters reject unknown values", () => {
  assert.equal(
    parseRepairSummaryFilter(REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING),
    REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING,
  )
  assert.equal(parseRepairSummaryFilter("unknown"), REPAIR_SUMMARY_FILTER.ALL)
  assert.equal(parseRepairSummaryFilter(null), REPAIR_SUMMARY_FILTER.ALL)
})

test("all non-empty filters use AND semantics", () => {
  assert.equal(
    matchesRepairListFilters(
      task,
      createFilters({
        workOrderQuery: "WO2607280001",
        customerQuery: "liuhaowei",
        deviceQuery: "NESTED-SN-999",
        status: TicketStatus.TECHNICIAN_REPAIRING,
      }),
    ),
    true,
  )

  assert.equal(
    matchesRepairListFilters(
      task,
      createFilters({
        workOrderQuery: "WO2607280001",
        customerQuery: "不存在的客户",
        deviceQuery: "NESTED-SN-999",
        status: TicketStatus.TECHNICIAN_REPAIRING,
      }),
    ),
    false,
  )
})

test("today filter accepts the complete ISO timestamp returned by the API", () => {
  const now = new Date("2026-07-29T10:00:00.000Z")

  assert.equal(
    matchesRepairTimeRange("2026-07-29T06:15:48.635Z", "today", {}, now),
    true,
  )
  assert.equal(
    matchesRepairTimeRange("2026-07-28T06:15:48.635Z", "today", {}, now),
    false,
  )
})

test("invalid or missing dates do not leak into an active time filter", () => {
  assert.equal(matchesRepairTimeRange("", "today"), false)
  assert.equal(matchesRepairTimeRange("not-a-date", "week"), false)
  assert.equal(matchesRepairTimeRange(null, "all"), true)
})

test("financial follow-up point filters combine with AND semantics", () => {
  const pendingAndUnsettled = {
    status: TicketStatus.WAREHOUSE_SHIPPING,
    isPaymentReceived: 0,
    isInvoiced: 0,
  }

  assert.equal(
    matchesFinancialFollowupFilters(pendingAndUnsettled, {
      pendingShipment: true,
      unpaid: true,
      notInvoiced: true,
    }),
    true,
  )
  assert.equal(
    matchesFinancialFollowupFilters(
      { ...pendingAndUnsettled, isPaymentReceived: 1 },
      { pendingShipment: true, unpaid: true, notInvoiced: true },
    ),
    false,
  )
})

test("completed batches do not match the pending shipment point filter", () => {
  assert.equal(
    matchesFinancialFollowupFilters(
      { status: TicketStatus.COMPLETED, isPaymentReceived: 0, isInvoiced: 0 },
      { pendingShipment: true, unpaid: false, notInvoiced: false },
    ),
    false,
  )
})
