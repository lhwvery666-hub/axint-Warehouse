import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { z } from "zod"
import * as enums from "../enums"
import * as policy from "../repair-report-policy"
import * as shipping from "../shipping-plan"
import * as visibility from "../ticket-visibility"
import * as correction from "../ticket-correction"

type QueryResult = { recordset: unknown[]; rowsAffected?: number[] }
type Params = Record<string, unknown>
type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>

/** Executes production handlers with real Zod/policies; only auth, NextResponse and database I/O are replaced. */
function route(file: string, query: (text: string, params: Params) => QueryResult, role: enums.UserRole = enums.UserRole.ADMIN, overrides: Record<string, unknown> = {}) {
  class RequestStub {
    params: Params = {}
    input(key: string, ...values: unknown[]) { this.params[key] = values.at(-1); return this }
    async query(text: string) { return query(text, this.params) }
  }
  class Transaction { async begin() {} async commit() {} async rollback() {} }
  const sql = { Request: RequestStub, Transaction, NVarChar: () => ({}), Decimal: () => ({}), Int: {}, Bit: {}, DateTime2: {}, MAX: 0, ISOLATION_LEVEL: { SERIALIZABLE: 1 } }
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "mssql": sql, "zod": { z }, "@/lib/enums": enums,
    "@/lib/auth-utils": { ALL_USER_ROLES: Object.values(enums.UserRole), checkUserRole: async () => ({ userId: "1", normalizedRole: role, username: "tester" }), isErrorResponse: () => false },
    "@/lib/db-config": { getDbConnection: async () => ({ request: () => new RequestStub() }) },
    "@/lib/repair-report-policy": policy, "@/lib/shipping-plan": shipping, "@/lib/ticket-visibility": visibility,
    "@/lib/ticket-correction": correction,
    "@prisma/client": { Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } } },
    ...overrides,
  }
  const source = ts.transpileModule(readFileSync(resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const fixtureModule = { exports: {} as Record<string, Handler> }
  runInNewContext(source, { exports: fixtureModule.exports, module: fixtureModule, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
    return modules[name]
  }, console, Date, Request, Response, File, FormData })
  return fixtureModule.exports
}
const ctx = { params: Promise.resolve({ batchId: "20261004001", id: "1" }) }
const request = (body: unknown, method = "PUT") => new Request("http://localhost/test", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const ok = { recordset: [], rowsAffected: [1] }
const businessFile = "app/api/tickets/business-info/[batchId]/route.ts"
const shippingFile = "app/api/tickets/shipping-info/[batchId]/route.ts"
const completeFile = "app/api/tickets/warehouse-shipping-batch/[batchId]/route.ts"
const reportFile = "app/api/tickets/batch-repair-report/[batchId]/route.ts"

test("finance totals device amounts once and saving payment does not rewrite prices or approval time", async () => {
  const rows = [{ Id: 1, Status: enums.TicketStatus.BUSINESS_REVIEW, RepairCost: 100, Quantity: 10 }, { Id: 2, Status: enums.TicketStatus.BUSINESS_REVIEW, RepairCost: 200, Quantity: 1 }]
  const updates: string[] = []
  const api = route(businessFile, (sql) => {
    if (sql.includes("SELECT")) return { recordset: rows }
    if (sql.includes("UPDATE")) updates.push(sql)
    return ok
  })
  const get = await api.GET(new Request("http://localhost/test"), ctx)
  assert.equal((await get.json()).data.totalCost, 300)
  const put = await api.PUT(request({ isPaymentReceived: true, isInvoiced: false }), ctx)
  assert.equal(put.status, 200)
  assert.equal(updates.length, 1)
  assert.doesNotMatch(updates[0], /RepairCost\]\s*=/)
  assert.doesNotMatch(updates[0], /BusinessReviewedAt\]\s*=/)
})

test("stale legacy batch total cannot overwrite current device amounts", async () => {
  let changed = false
  const api = route(businessFile, sql => {
    if (sql.includes("SELECT")) return { recordset: [{ Id: 1, Status: enums.TicketStatus.BUSINESS_REVIEW, RepairCost: 300 }] }
    changed = true; return ok
  })
  assert.equal((await api.PUT(request({ totalCost: 100, isPaymentReceived: true, isInvoiced: true }), ctx)).status, 409)
  assert.equal(changed, false)
})

test("unsigned report edits preserve workflow metadata; signed report cannot be edited", async () => {
  for (const signed of [false, true]) {
    let content: string | undefined
    const old = { repairContent: "old", finalOutcome: enums.FinalOutcome.COMPLETED, willReturn: false, shippingAllocation: { stockQuantity: 2 } }
    const api = route(reportFile, (sql, params) => {
      if (sql.includes("SELECT")) return { recordset: [{ Id: 1, Quantity: 2, Status: enums.TicketStatus.PENDING_REPORTER_CONFIRM, RepairReportContent: JSON.stringify(old), SignedReportPhoto: signed ? "/private/sign.png" : null, ReporterConfirmedAt: null }] }
      if (sql.includes("UPDATE")) content = String(params.reportContent)
      return ok
    })
    const response = await api.PUT(request({ devices: [{ id: 1, repairContent: "new", improvements: "", repairCost: 50 }], remarks: "customer note" }), ctx)
    assert.equal(response.status, signed ? 409 : 200)
    if (signed) assert.equal(content, undefined)
    else {
      const saved = JSON.parse(content!)
      assert.equal(saved.repairContent, "new")
      assert.equal(saved.finalOutcome, old.finalOutcome)
      assert.equal(saved.willReturn, false)
      assert.deepEqual(saved.shippingAllocation, old.shippingAllocation)
      assert.equal(saved.remarks, "customer note")
    }
  }
})

const shipmentRow = (stockQuantity = 0) => ({
  Id: 1, Quantity: 10, Status: enums.TicketStatus.WAREHOUSE_SHIPPING, ReportByUserID: 1,
  RepairReportContent: JSON.stringify({ finalOutcome: enums.FinalOutcome.COMPLETED, shippingAllocation: { stockQuantity } }),
  ShippingType: stockQuantity === 10 ? "stock" : "return", ReturnQuantity: 10 - stockQuantity,
  ReturnDate: stockQuantity === 10 ? null : new Date("2026-10-04T00:00:00Z"), ReturnTrackingNum: stockQuantity === 10 ? null : "TRACK",
  WarehouseShippedAt: new Date("2026-10-04T08:00:00Z"), WarehouseShippedBy: "warehouse",
})

test("shipping rejects one-of-ten partial return without an explicit stock allocation", async () => {
  let changed = false
  const api = route(shippingFile, sql => {
    if (sql.includes("SELECT")) return { recordset: [shipmentRow()] }
    changed = true; return ok
  })
  const response = await api.PUT(request({ shippingType: "return", returnQuantity: 1, returnDate: "2026-10-04T00:00:00Z", returnTrackingNum: "TRACK" }), ctx)
  assert.equal(response.status, 400)
  assert.equal(changed, false)
})

test("ten devices may be allocated three stock and seven returned in one shipment", async () => {
  let saved: Params | undefined
  const api = route(shippingFile, (sql, params) => {
    if (sql.includes("SELECT")) return { recordset: [shipmentRow()] }
    if (sql.includes("UPDATE")) saved = params
    return ok
  })
  const response = await api.PUT(request({ shippingType: "return", returnQuantity: 7, returnDate: "2026-10-04T00:00:00Z", returnTrackingNum: "TRACK", allocations: [{ deviceId: 1, stockQuantity: 3 }] }), ctx)
  assert.equal(response.status, 200)
  assert.equal(saved?.returnQuantity, 7)
  const content = JSON.parse(String(saved?.reportContent))
  assert.equal(content.finalOutcome, enums.FinalOutcome.COMPLETED)
  assert.equal(content.shippingAllocation.stockQuantity, 3)
  const complete = route(completeFile, sql => sql.includes("SELECT") ? { recordset: [shipmentRow(3)] } : ok)
  const finish = await complete.POST(new Request("http://localhost/test", { method: "POST" }), ctx)
  assert.equal(finish.status, 200)
  assert.equal((await finish.json()).data.returnQuantity, 7)
})

test("completion rejects missing outcomes and mismatched return counts", async () => {
  for (const row of [{ ...shipmentRow(), RepairReportContent: "{}" }, { ...shipmentRow(), ReturnQuantity: 1 }]) {
    let changed = false
    const api = route(completeFile, sql => {
      if (sql.includes("SELECT")) return { recordset: [row] }
      changed = true; return ok
    })
    assert.equal((await api.POST(new Request("http://localhost/test", { method: "POST" }), ctx)).status, 409)
    assert.equal(changed, false)
  }
})

test("stock-only saved shipments retain their disposition, operator and completion date on reload", async () => {
  const row = shipmentRow(10)
  const api = route(shippingFile, () => ({ recordset: [row] }))
  const response = await api.GET(new Request("http://localhost/test"), ctx)
  assert.equal(response.status, 200)
  const data = (await response.json()).data
  assert.equal(data.shippingType, "stock")
  assert.equal(data.stockQuantity, 10)
  assert.equal(data.returnQuantity, 0)
  assert.equal(data.shippedBy, "warehouse")
  assert.equal(data.shippedAt, row.WarehouseShippedAt.toISOString())
})

test("shipping rejects other reporter's batch and invalid allocation membership", async () => {
  const api = route(shippingFile, () => ({ recordset: [{ ...shipmentRow(), ReportByUserID: 2 }] }), enums.UserRole.REPORTER)
  assert.equal((await api.GET(new Request("http://localhost/test"), ctx)).status, 404)
  assert.throws(() => shipping.buildShippingPlan([shipmentRow()], [{ deviceId: 2, stockQuantity: 1 }]))
  assert.throws(() => shipping.buildShippingPlan([shipmentRow()], [{ deviceId: 1, stockQuantity: 11 }]))
})

test("signature history remains locked if the photo is missing and decimal sums remain exact", () => {
  assert.equal(policy.isSignedRepairReport({ SignedReportPhoto: null, ReporterConfirmedAt: new Date() }), true)
  assert.equal(policy.isSignedRepairReport({ SignedReportPhoto: "  ", ReporterConfirmedAt: null }), false)
  assert.equal(policy.sumRepairCosts([{ RepairCost: "0.10" }, { RepairCost: "0.20" }]), 0.3)
})

test("retired signature withdrawal and modification routes never touch storage or database", async () => {
  const api = route("app/api/tickets/signed-photo/[batchId]/route.ts", () => { throw new Error("must not reach database") })
  assert.equal((await api.DELETE(new Request("http://localhost/test", { method: "DELETE" }), ctx)).status, 410)
  assert.equal((await api.PUT(request({ reason: "unlock" }), ctx)).status, 410)
})

test("legacy single-ticket report edits preserve workflow metadata and reject a signature", async () => {
  for (const signed of [false, true]) {
    let saved: Params | undefined
    const api = route("app/api/tickets/[id]/repair-report/route.ts", (sql, params) => {
      if (sql.includes("SELECT")) return { recordset: [{ Id: 1, BatchId: "batch", RepairReportContent: '{"finalOutcome":"Completed","willReturn":false}', SignedReportPhoto: signed ? "/sign.png" : null }] }
      if (sql.includes("UPDATE")) saved = params
      return ok
    })
    const response = await api.PUT(request({ items: [{ deviceModel: "model", quantity: 10, serialNumber: "sn", repairContent: "fixed", repairCost: 100, improvements: "" }], totalCost: 99999 }), ctx)
    assert.equal(response.status, signed ? 409 : 200)
    if (signed) assert.equal(saved, undefined)
    else {
      assert.equal(saved?.cost, 100)
      assert.equal(JSON.parse(String(saved?.content)).willReturn, false)
    }
  }
})

test("signed correction approval rejects report changes and rollback but permits logistics", async () => {
  const cases = [
    { field: "projectName", impact: correction.CORRECTION_IMPACT.NONE, expected: 409 },
    { field: "trackingNumber", impact: correction.CORRECTION_IMPACT.REPAIR_REVIEW, expected: 409 },
    { field: "trackingNumber", impact: correction.CORRECTION_IMPACT.NONE, expected: 200 },
  ]
  for (const { field, impact, expected } of cases) {
    let ticketWrites = 0
    let isolation: unknown
    const tx = {
      repair_Ticket_History: {
        findUnique: async () => ({ actionType: correction.CORRECTION_ACTION.REQUESTED, batchId: "batch", actionNote: JSON.stringify({ version: 1, batchId: "batch", impact, deviceVersions: [], changes: [{ scope: "batch", field, oldValue: "old", newValue: "new", impact }] }) }),
        updateMany: async () => ({ count: 1 }), create: async () => ({}),
      },
      repair_Tickets: {
        findMany: async () => [{ id: 1, ProjectName: "old", trackingNumberIn: "old", SignedReportPhoto: "/sign.png" }],
        updateMany: async () => { ticketWrites += 1; return { count: 1 } },
      },
    }
    const api = route("app/api/tickets/correction-requests/[requestId]/route.ts", () => ok, enums.UserRole.ADMIN, {
      "@/lib/prisma": { prisma: { $transaction: async (callback: (value: typeof tx) => Promise<unknown>, options: { isolationLevel: unknown }) => { isolation = options.isolationLevel; return callback(tx) } } },
    })
    const response = await api.PATCH(request({ decision: "approve" }, "PATCH"), { params: Promise.resolve({ requestId: "1" }) })
    assert.equal(response.status, expected)
    assert.equal(ticketWrites, expected === 200 ? 1 : 0)
    assert.equal(isolation, "Serializable")
  }
})

test("correction request rechecks signature inside the transaction", async () => {
  let historyWrites = 0
  const row = { id: 1, ReportByUserID: 1, status: enums.TicketStatus.PENDING_REPORTER_CONFIRM, ProjectName: "old", SignedReportPhoto: null }
  const tx = {
    repair_Tickets: { findMany: async () => [{ ...row, SignedReportPhoto: "/just-signed.png" }] },
    repair_Ticket_History: { findFirst: async () => null, create: async () => { historyWrites += 1; return { historyId: 1 } } },
  }
  const api = route("app/api/tickets/correction-requests/route.ts", () => ok, enums.UserRole.REPORTER, {
    "@/lib/prisma": { prisma: {
      repair_Tickets: { findMany: async () => [row] }, repair_Ticket_History: { findFirst: async () => null },
      $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    } },
  })
  const response = await api.POST(request({ batchId: "batch", reason: "correct client", projectName: "new", devices: [{ deviceId: 1 }] }, "POST"), ctx)
  assert.equal(response.status, 409)
  assert.equal(historyWrites, 0)
})

test("customer shipment completion rejects multiple tracking numbers in one batch", async () => {
  let changed = false
  const api = route(completeFile, sql => {
    if (sql.includes("SELECT")) return { recordset: [shipmentRow(), { ...shipmentRow(), Id: 2, ReturnTrackingNum: "OTHER" }] }
    changed = true; return ok
  })
  assert.equal((await api.POST(new Request("http://localhost/test", { method: "POST" }), ctx)).status, 409)
  assert.equal(changed, false)
})

test("confirmed stock disposition defaults to stock and cannot be reassigned to a customer shipment", async () => {
  const rows = [
    { ...shipmentRow(), Quantity: 1, ShippingType: null, RepairReportContent: JSON.stringify({ finalOutcome: enums.FinalOutcome.SCRAPPED }) },
    { ...shipmentRow(), Id: 2, Quantity: 1, ShippingType: null, RepairReportContent: JSON.stringify({ finalOutcome: enums.FinalOutcome.COMPLETED }) },
  ]
  const api = route(shippingFile, () => ({ recordset: rows }))
  const response = await api.GET(new Request("http://localhost/test"), ctx)
  const data = (await response.json()).data
  assert.equal(data.stockQuantity, 1)
  assert.equal(data.returnQuantity, 1)
  assert.equal(data.allocations[0].stockQuantityLocked, true)
  assert.equal(shipping.summarizeShippingPlan(shipping.buildShippingPlan(rows)).stockQuantity, 1)
  assert.throws(() => shipping.buildShippingPlan(rows, [{ deviceId: 1, stockQuantity: 0 }, { deviceId: 2, stockQuantity: 0 }]), /去向矛盾/)
  const noReturn = { ...rows[1], RepairReportContent: JSON.stringify({ finalOutcome: enums.FinalOutcome.COMPLETED, willReturn: false }) }
  assert.equal(shipping.getSavedShippingAllocation(noReturn).stockQuantity, 1)
  assert.throws(() => shipping.buildShippingPlan([noReturn], [{ deviceId: 2, stockQuantity: 0 }]), /去向矛盾/)
})

test("finance may track payment after signature while preserving the signed client name", async () => {
  let writes = 0
  const api = route(businessFile, sql => {
    if (sql.includes("SELECT")) return { recordset: [{ Id: 1, Status: enums.TicketStatus.BUSINESS_REVIEW, RepairCost: 100, ClientName: "Signed client", SignedReportPhoto: "/sign.png" }] }
    writes += 1; return ok
  })
  assert.equal((await api.PUT(request({ clientName: "Other client", isPaymentReceived: true, isInvoiced: true }), ctx)).status, 409)
  assert.equal(writes, 0)
  assert.equal((await api.PUT(request({ isPaymentReceived: true, isInvoiced: true }), ctx)).status, 200)
  assert.ok(writes > 0)
})

test("signature confirmation blocks replacement and races while allowing the separate workflow advance", async () => {
  const file = "app/api/tickets/reporter-confirm/[batchId]/route.ts"
  const storage = { "@/lib/storage/storage-adapter": { getStorageAdapter: () => ({ getUrl: (path: string) => path }) }, "@/lib/storage/upload-security": {} }
  const signedRow = { Id: 1, ReportByUserID: 1, Status: enums.TicketStatus.PENDING_REPORTER_CONFIRM, SignedReportPhoto: "/sign.png" }
  for (const operation of ["replace", "edit", "race", "advance"]) {
    let reads = 0
    let writes = 0
    const api = route(file, sql => {
      if (sql.includes("SELECT")) {
        reads += 1
        return { recordset: [{ ...signedRow, SignedReportPhoto: operation === "race" && reads === 1 ? null : "/sign.png" }] }
      }
      writes += 1; return ok
    }, enums.UserRole.REPORTER, storage)
    const form = new FormData()
    if (operation === "replace") form.set("signedPhoto", new File(["test"], "sign.png", { type: "image/png" }))
    else if (operation === "advance") form.set("advanceFlow", "true")
    else form.set("devices", JSON.stringify([{ id: 1, willReturn: false }]))
    const response = await api.PUT(new Request("http://localhost/test", { method: "PUT", body: form }), ctx)
    assert.equal(response.status, operation === "advance" ? 200 : 409)
    assert.equal(writes > 0, operation === "advance")
    if (operation === "race") assert.equal(reads, 2)
  }
})
