import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { z } from "zod"
import * as enums from "../enums"
import * as reconcile from "../batch-device-reconciliation"
import * as quantity from "../device-quantity"
import * as fields from "../batch-device-fields"
import * as policy from "../repair-report-policy"

type Row = Record<string, unknown>
type Handler = (request: Request, context: { params: Promise<{ batchId: string }> }) => Promise<Response>
function loadRoute(rows: Row[]) {
  const writes: Array<{ operation: string; input: Row }> = []
  const tx = {
    $queryRaw: async () => rows,
    repair_Tickets: {
      updateMany: async (input: Row) => { writes.push({ operation: "updateMany", input }); return { count: rows.length } },
      update: async (input: Row) => { writes.push({ operation: "update", input }) },
      deleteMany: async (input: Row) => { writes.push({ operation: "delete", input }); return { count: 1 } },
      create: async (input: Row) => { writes.push({ operation: "create", input }); return { id: 99 } },
    },
    repair_Ticket_History: { create: async (input: Row) => { writes.push({ operation: "history", input }) } },
  }
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/enums": enums, "zod": { z },
    "@/lib/auth-utils": { checkUserRole: async () => ({ userId: "1", normalizedRole: enums.UserRole.ADMIN, username: "tester" }), isErrorResponse: () => false },
    "@/lib/prisma": { prisma: { $queryRaw: async () => [{ COLUMN_NAME: "RepairCost" }], $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } },
    "@prisma/client": { Prisma: { sql: () => ({}), raw: (value: unknown) => value, Decimal: class { constructor(public value: string) {} } } },
    "@/lib/device-quantity": quantity, "@/lib/batch-device-reconciliation": reconcile,
    "@/lib/batch-device-fields": fields, "@/lib/repair-report-policy": policy,
  }
  const routeModule = { exports: {} as { PUT: Handler } }
  const code = ts.transpileModule(readFileSync("app/api/tickets/batch-update/[batchId]/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, { exports: routeModule.exports, module: routeModule, require: (name: string) => {
    assert.ok(name in modules, name)
    return modules[name]
  }, console: { log() {}, error() {} }, Date })
  return { put: (body: unknown) => routeModule.exports.PUT(new Request("http://localhost/batch", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ batchId: "20261004001" }) }), writes }
}
const row = (id: number, signed = false): Row => ({
  Id: id, Status: enums.TicketStatus.CREATED, ReportByUserID: 1, DeviceSN: "SN-" + id,
  ModelName: "Model-1", DeviceName: "Internal", Problem: "fault", MaterialCode: "MAT", Quantity: 50,
  ProjectName: "Customer", ProjectLocation: "Project", ContactInfo: "Contact", SenderAddress: "Address",
  TrackingNumber_In: "TRACK", CourierCompany: "Courier", SignedReportPhoto: signed ? "/signature.png" : null,
  DevicePhotos: '["/old.png"]',
})

test("stale batch handler responds 409 before any updates or deletions", async () => {
  const api = loadRoute([row(1), row(2), row(3)])
  const response = await api.put({ expectedDeviceIds: [1, 2], devices: [{ deviceId: 1 }, { deviceId: 2 }] })
  assert.equal(response.status, 409)
  assert.equal(api.writes.length, 0)
})

test("photo-only retry preserves customer fields, SN, model, internal data and quantity; [] clears photos", async () => {
  const api = loadRoute([row(1, true)])
  const response = await api.put({ expectedDeviceIds: [1], devices: [{ deviceId: 1, deviceImages: [] }] })
  assert.equal(response.status, 200)
  assert.equal(api.writes.some((write) => write.operation === "updateMany"), false)
  const saved = api.writes.find((write) => write.operation === "update")?.input.data as Row
  assert.equal(saved.deviceSn, "SN-1")
  assert.equal(saved.modelName, "Model-1")
  assert.equal(saved.deviceName, "Internal")
  assert.equal(saved.Quantity, 50)
  assert.equal(saved.devicePhotos, null)
  assert.equal("SignedReportPhoto" in saved, false)
})

test("signed report prevents actual customer/project/quantity changes but accepts unchanged values", async () => {
  for (const patch of [{ projectName: "Changed" }, { projectLocation: "Changed" }, { contactInfo: "Changed" }, { senderAddress: "Changed" }, { devices: [{ deviceId: 1, quantity: 1 }] }]) {
    const api = loadRoute([row(1, true)])
    assert.equal((await api.put({ expectedDeviceIds: [1], devices: [{ deviceId: 1 }], ...patch })).status, 409)
    assert.equal(api.writes.length, 0)
  }
  const api = loadRoute([row(1, true)])
  assert.equal((await api.put({ expectedDeviceIds: [1], projectName: "Customer", devices: [{ deviceId: 1, quantity: 50 }] })).status, 200)
})
