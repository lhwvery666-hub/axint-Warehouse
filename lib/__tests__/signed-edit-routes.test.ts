// Execute the production handlers with in-memory transaction fixtures; no SQL Server or browser E2E.
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { z } from "zod"
import * as enums from "../enums"
import * as signedFields from "../signed-report-fields"
import * as reportPolicy from "../repair-report-policy"
import * as apiMessages from "../api-messages"
import * as visibility from "../ticket-visibility"
import * as identityPermissions from "../device-identity-permissions"
import * as deviceDiff from "../device-update-diff"

type Row = Record<string, unknown>
type Handler = (request: Request, context: { params: Promise<{ id: string; batchId: string; deviceId: string }> }) => Promise<Response>
type SqlNode = { text: string }
const responseModule = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }
const authModule = { ALL_USER_ROLES: Object.values(enums.UserRole), checkUserRole: async () => ({ userId: "1", normalizedRole: enums.UserRole.ADMIN, username: "tester", realName: "Test" }), isErrorResponse: () => false }
const context = { params: Promise.resolve({ id: "1", batchId: "20261004001", deviceId: "1" }) }
const request = (body: unknown) => new Request("http://localhost/ticket", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
function compile(file: string, modules: Record<string, unknown>): { PUT: Handler; DELETE: Handler } {
  const routeModule = { exports: {} as { PUT: Handler; DELETE: Handler } }
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports: routeModule.exports, module: routeModule, require: (name: string) => {
    assert.ok(name in modules, "Unexpected import: " + name)
    return modules[name]
  }, console: { log() {}, error() {} }, Date, Request, Response })
  return routeModule.exports
}
const baseRow = (signed: boolean): Row => ({
  Id: 1, TicketId: "T1", BatchId: "20261004001", Status: enums.TicketStatus.IN_REPAIR,
  DeviceSN: "SN1", DeviceName: "Device1", ModelName: "Model1", MaterialCode: "MAT1", FullSpec: "Spec1",
  ManufactureDate: new Date("2024-01-01T00:00:00.000Z"), WarrantyStatus: "OutOfWarranty", ArrivalDate: null,
  SignedReportPhoto: signed ? "/signed.png" : null, ReporterConfirmedAt: null,
  ProjectName: "Customer", ProjectLocation: "Project", ContactInfo: "Contact", SenderAddress: "Address",
  RepairCost: 100, Quantity: 2, WarrantyStatusOverride: "InWarranty", ReportByUserID: 1,
})
function genericFixture(signed: boolean, failHistory = false) {
  const committed: Array<{ kind: string; value: unknown }> = []
  let pending: typeof committed = []
  let rolledBack = false
  const row = baseRow(signed)
  const textOf = (value: unknown): string => value && typeof value === "object" && "text" in value ? String(value.text) : String(value)
  const sql = (strings: TemplateStringsArray, ...values: unknown[]): SqlNode => ({ text: strings.reduce((text, part, index) => text + part + (index < values.length ? textOf(values[index]) : ""), "") })
  const tx = {
    $queryRaw: async (query: SqlNode) => {
      if (/DELETE FROM/.test(query.text)) { pending.push({ kind: "delete", value: query.text }); return [row] }
      assert.match(query.text, /WITH \(UPDLOCK, HOLDLOCK\)/)
      const projection = query.text.match(/SELECT TOP 1 ([\s\S]*?)\s+FROM/)?.[1]
      assert.ok(projection)
      const selected: Row = {}
      for (const expression of projection.split(",")) {
        const match = expression.trim().match(/^\[?(\w+)\]?(?:\s+as\s+\[?(\w+)\]?)?$/i)
        assert.ok(match, expression)
        selected[match[2] || match[1]] = row[match[1]]
      }
      return [selected]
    },
    $executeRaw: async (query: SqlNode) => { pending.push({ kind: "update", value: query.text }); return 1 },
    device_Inventory: { findFirst: async () => ({ materialCode: "AUTO", modelName: "AUTO-SPEC" }) },
    repair_Ticket_History: { create: async (input: Row) => { if (failHistory) throw new Error("simulated log failure"); pending.push({ kind: "history", value: input }); return {} } },
  }
  type TransactionClient = typeof tx
  const prisma = { $transaction: async (callback: (client: TransactionClient) => Promise<unknown>) => {
    pending = []
    try { const result = await callback(tx); committed.push(...pending); return result }
    catch (error) { pending = []; rolledBack = true; throw error }
  } }
  const route = compile("app/api/tickets/[id]/route.ts", {
    "next/server": responseModule, "zod": { z }, "@/lib/enums": enums,
    "@/lib/auth-utils": authModule, "@/lib/prisma": { prisma },
    "@prisma/client": { Prisma: { sql, raw: (value: string) => ({ text: value }), join: (nodes: SqlNode[]) => ({ text: nodes.map((node) => node.text).join(", ") }), empty: { text: "" }, TransactionIsolationLevel: { Serializable: "Serializable" } } },
    "@/lib/repair-report-policy": reportPolicy, "@/lib/signed-report-fields": signedFields, "@/lib/api-messages": apiMessages, "@/lib/ticket-visibility": visibility,
  })
  return { put: (body: unknown) => route.PUT(request(body), context), remove: () => route.DELETE(new Request("http://localhost/ticket", { method: "DELETE" }), context), committed, row, rolledBack: () => rolledBack }
}

test("generic PUT rejects signed price and SN changes before writing", async () => {
  for (const body of [{ repairCost: 200 }, { productSN: "SN2" }, { quantity: 3 }, { warrantyStatusOverride: "OutOfWarranty" }]) {
    const api = genericFixture(true)
    assert.equal((await api.put(body)).status, 409)
    assert.equal(api.committed.length, 0)
  }
})
test("generic PUT permits signed logistics/invoicing and creates history in the same transaction", async () => {
  const api = genericFixture(true)
  const response = await api.put({ isInvoiced: true, returnTrackingNum: "TRACK2" })
  assert.equal(response.status, 200)
  assert.deepEqual(api.committed.map((operation) => operation.kind), ["update", "history"])
  assert.match(String(api.committed[0].value), /\[IsInvoiced\]/)
  assert.match(String(api.committed[0].value), /\[ReturnTrackingNum\]/)
  assert.match(JSON.stringify(api.committed[1].value), /IsInvoiced/)
  assert.equal((await response.json()).data.statusChanged, false)
})
test("generic PUT permits unsigned price and SN edits; log failure rolls back the write", async () => {
  const allowed = genericFixture(false)
  assert.equal((await allowed.put({ productSN: "SN2", repairCost: 200 })).status, 200)
  assert.equal(allowed.committed.length, 2)
  const rejected = genericFixture(false, true)
  assert.equal((await rejected.put({ repairCost: 200 })).status, 500)
  assert.equal(rejected.rolledBack(), true)
  assert.equal(rejected.committed.length, 0)
})

function mssqlFixture(file: string, signed: boolean, failHistory = false) {
  const row = baseRow(signed)
  const committed: Array<{ query: string; params: Row }> = []
  let pending: typeof committed = []
  let rolledBack = false
  class Transaction {
    async begin() { pending = [] }
    async commit() { committed.push(...pending); pending = [] }
    async rollback() { rolledBack = true; pending = [] }
  }
  class RequestStub {
    params: Row = {}
    input(key: string, ...values: unknown[]) { this.params[key] = values.at(-1); return this }
    async query(query: string) {
      if (query.includes("SELECT") && query.includes("Device_Inventory")) return { recordset: [{ SerialNumber: "SN2", DeviceName: "Device", MaterialCode: "MAT", Status: "unknown" }] }
      if (query.includes("SELECT")) {
        assert.match(query, /WITH \(UPDLOCK, HOLDLOCK\)/)
        const projection = query.match(/SELECT(?: TOP \(?1\)?)? ([\s\S]*?)\s+FROM/)?.[1]
        assert.ok(projection)
        const selected: Row = {}
        for (const expression of projection.split(",")) {
          const match = expression.trim().match(/^\[?(\w+)\]?(?:\s+as\s+\[?(\w+)\]?)?$/i)
          assert.ok(match, expression)
          selected[match[2] || match[1]] = row[match[1]]
        }
        return { recordset: [selected] }
      }
      if (query.includes("Repair_Ticket_History") && failHistory) throw new Error("simulated log failure")
      if (query.includes("@newDeviceSN")) {
        // Evaluate the guard present in the actual UPDATE. This is not a SQL Server integration test.
        assert.match(query, /NULLIF\(LTRIM\(RTRIM\(\[SignedReportPhoto\]\)\), ''\) IS NULL/)
        assert.match(query, /\[ReporterConfirmedAt\] IS NULL/)
        if (row.SignedReportPhoto || row.ReporterConfirmedAt) return { recordset: [], rowsAffected: [0] }
      }
      pending.push({ query, params: { ...this.params } })
      return { recordset: [{ Id: 1, TicketId: "T1", BatchId: "20261004001", DeviceSN: "SN2", OldStatus: row.Status, NewStatus: row.Status }], rowsAffected: [1] }
    }
  }
  const route = compile(file, {
    "next/server": responseModule, "zod": { z }, "@/lib/enums": enums, "@/lib/auth-utils": authModule,
    "@/lib/repair-report-policy": reportPolicy,
    "@/lib/device-identity-permissions": identityPermissions, "@/lib/device-update-diff": deviceDiff,
    "@/lib/ticket-visibility": visibility,
    "@/lib/db-config": { getDbConnection: async () => ({}) },
    "mssql": { Request: RequestStub, Transaction, NVarChar: () => ({}), Int: () => ({}), DateTime2: () => ({}), MAX: 0 },
  })
  return { put: (body: unknown) => route.PUT(request(body), context), committed, row, rolledBack: () => rolledBack }
}
const batchInfo = "app/api/tickets/batch-info/[batchId]/route.ts"
const legacyUpdate = "app/api/tickets/[id]/update/route.ts"

test("batch-info rejects signed customer changes, allows unsigned changes and logs them", async () => {
  for (const signed of [true, false]) {
    const api = mssqlFixture(batchInfo, signed)
    assert.equal((await api.put({ projectName: "New customer" })).status, signed ? 409 : 200)
    assert.equal(api.committed.length, signed ? 0 : 2)
    if (!signed) assert.match(api.committed[1].query, /INSERT INTO.*Repair_Ticket_History/)
  }
})
test("batch-info log failure rolls back customer update", async () => {
  const api = mssqlFixture(batchInfo, false, true)
  assert.equal((await api.put({ projectLocation: "New project" })).status, 500)
  assert.equal(api.rolledBack(), true)
  assert.equal(api.committed.length, 0)
})
test("supplementSN rejects either signature evidence and logs unsigned changes", async () => {
  for (const signatureKind of ["photo", "confirmed", "unsigned"]) {
    const api = mssqlFixture(legacyUpdate, signatureKind === "photo")
    if (signatureKind === "confirmed") api.row.ReporterConfirmedAt = new Date()
    assert.equal((await api.put({ action: "supplementSN", newSerialNumber: "SN2" })).status, signatureKind === "unsigned" ? 200 : 409)
    assert.equal(api.committed.length, signatureKind === "unsigned" ? 2 : 0)
  }
})
test("legacy logistics remains editable after signing; failed history rolls back", async () => {
  for (const failHistory of [false, true]) {
    const api = mssqlFixture(legacyUpdate, true, failHistory)
    assert.equal((await api.put({ returnTrackingNum: "TRACK2", returnQuantity: 2 })).status, failHistory ? 500 : 200)
    assert.equal(api.committed.length, failHistory ? 0 : 2)
    if (failHistory) assert.equal(api.rolledBack(), true)
  }
})

const batchDevices = "app/api/tickets/batch-devices/[batchId]/route.ts"
const manufactureDate = "app/api/tickets/manufacture-date/[deviceId]/route.ts"

test("batch-device changes cannot bypass signing by an editable workflow status", async () => {
  for (const updates of [{ modelName: "Model2" }, { deviceSn: "SN2" }, { quantity: 3 }, { faultDescription: "Different fault" }]) {
    const api = mssqlFixture(batchDevices, true)
    api.row.Status = enums.TicketStatus.CREATED
    assert.equal((await api.put({ deviceId: 1, updates })).status, 409)
    assert.equal(api.committed.length, 0)
  }
  const api = mssqlFixture(batchDevices, false)
  api.row.Status = enums.TicketStatus.CREATED
  api.row.ReporterConfirmedAt = new Date()
  assert.equal((await api.put({ deviceId: 1, updates: { modelName: "Model2" } })).status, 409)
})
test("batch-device identical values are no-op after signing; customer return date still saves and logs", async () => {
  const unchanged = mssqlFixture(batchDevices, true)
  unchanged.row.Status = enums.TicketStatus.CREATED
  const result = await unchanged.put({ deviceId: 1, updates: { modelName: "Model1", quantity: 2 } })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).changed, false)
  assert.equal(unchanged.committed.length, 0)
  const logistics = mssqlFixture(batchDevices, true)
  logistics.row.Status = enums.TicketStatus.CREATED
  assert.equal((await logistics.put({ deviceId: 1, updates: { arrivalDate: "2026-10-04T00:00:00.000Z" } })).status, 200)
  assert.equal(logistics.committed.length, 2)
})
test("batch-device unsigned edit is atomic with its audit history", async () => {
  for (const failHistory of [false, true]) {
    const api = mssqlFixture(batchDevices, false, failHistory)
    api.row.Status = enums.TicketStatus.CREATED
    assert.equal((await api.put({ deviceId: 1, updates: { quantity: 3 } })).status, failHistory ? 500 : 200)
    assert.equal(api.committed.length, failHistory ? 0 : 2)
    if (failHistory) assert.equal(api.rolledBack(), true)
  }
})
test("manufacture date and warranty changes are frozen by either signature evidence", async () => {
  for (const body of [{ manufactureDate: "2025-01-01T00:00:00.000Z" }, { warrantyStatus: "InWarranty" }]) {
    for (const photo of [true, false]) {
      const api = mssqlFixture(manufactureDate, photo)
      if (!photo) api.row.ReporterConfirmedAt = new Date()
      assert.equal((await api.put(body)).status, 409)
      assert.equal(api.committed.length, 0)
    }
  }
})
test("manufacture date unchanged is a signed no-op; partial warranty edit preserves existing date", async () => {
  const unchanged = mssqlFixture(manufactureDate, true)
  const result = await unchanged.put({ warrantyStatus: "OutOfWarranty" })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).changed, false)
  assert.equal(unchanged.committed.length, 0)
  const unsigned = mssqlFixture(manufactureDate, false)
  assert.equal((await unsigned.put({ warrantyStatus: "InWarranty" })).status, 200)
  assert.equal(unsigned.committed.length, 2)
  assert.equal(unsigned.committed[0].params.manufactureDate, unsigned.row.ManufactureDate)
  const failure = mssqlFixture(manufactureDate, false, true)
  assert.equal((await failure.put({ warrantyStatus: "InWarranty" })).status, 500)
  assert.equal(failure.rolledBack(), true)
  assert.equal(failure.committed.length, 0)
})
test("administrator physical deletion cannot remove signed reports; unsigned deletion is audited atomically", async () => {
  for (const photo of [true, false]) {
    const api = genericFixture(photo)
    if (!photo) api.row.ReporterConfirmedAt = new Date()
    assert.equal((await api.remove()).status, 409)
    assert.equal(api.committed.length, 0)
  }
  const allowed = genericFixture(false)
  assert.equal((await allowed.remove()).status, 200)
  assert.deepEqual(allowed.committed.map((operation) => operation.kind), ["delete", "history"])
  const failure = genericFixture(false, true)
  assert.equal((await failure.remove()).status, 500)
  assert.equal(failure.rolledBack(), true)
  assert.equal(failure.committed.length, 0)
})

test("generic PUT also blocks automatic material enrichment on a signed report", async () => {
  const api = genericFixture(true)
  api.row.MaterialCode = null
  api.row.FullSpec = null
  // Whitespace normalizes to the existing model, but legacy enrichment still runs.
  assert.equal((await api.put({ modelName: " Model1 " })).status, 409)
  assert.equal(api.committed.length, 0)
})
