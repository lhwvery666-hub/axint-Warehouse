/** Real handlers/crypto/file validators; only cookies, SQL and storage I/O are synthetic. */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import ts from "typescript"
import bcrypt from "bcryptjs"
import { UserRole, SPECIAL_VALUES } from "@/lib/enums"
import { verifySessionToken } from "@/lib/session"

const realRequire = createRequire(import.meta.url)
type Row = Record<string, unknown>
function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(resolve(file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  const requireDependency = (id: string) => Object.hasOwn(dependencies, id) ? dependencies[id]
    : realRequire(id.startsWith("@/") ? resolve(`${id.slice(2)}.ts`) : id)
  new Function("require", "module", "exports", compiled)(requireDependency, loaded, loaded.exports)
  return loaded.exports as T
}
interface PostRoute { POST(request: Request): Promise<Response> }

test("真实登录→认证链：新密码立即撤销旧cookie，伪造userId/角色不能获得权限", async () => {
  const oldSecret = process.env.AUTH_SESSION_SECRET
  process.env.AUTH_SESSION_SECRET = "synthetic-security-handler-test-secret"
  try {
    let passwordHash = bcrypt.hashSync("test-old-password", 4)
    const jar = new Map<string, string>()
    let actualRole = UserRole.REPORTER
    let deleted = false
    const pool = { request: () => ({
      input() { return this },
      async query() { return { recordset: deleted ? [] : [{
        UserID: 1, Username: "test", Password: passwordHash, Role: actualRole, RealName: "测试",
      }] } },
    }) }
    const dependencies = {
      "next/headers": { cookies: async () => ({
        get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined,
        set: (key: string, value: string) => jar.set(key, value),
      }) },
      "@/lib/db-config": { getDbConnection: async () => pool },
      "@/lib/field-checks": { getUserQueryConfig: async () => ({
        fields: "UserID, Username, Password, Role, RealName", conditions: "AND IsDeleted = 0", hasIsDeleted: true,
      }) },
    }
    const login = load<PostRoute>("app/api/auth/login/route.ts", dependencies)
    const authenticate = load<{ checkUserRole(roles: UserRole[]): Promise<{ normalizedRole: UserRole } | Response> }>("lib/auth-utils.ts", dependencies)
    const signIn = (password: string) => login.POST(new Request("http://localhost/api/auth/login", {
      method: "POST", body: JSON.stringify({ username: "test", password }),
    }))
    assert.equal((await signIn("wrong-password")).status, 401)
    assert.equal(jar.size, 0)
    assert.equal((await signIn("test-old-password")).status, 200)
    const oldToken = jar.get("session")!
    assert.equal(verifySessionToken(oldToken, passwordHash), "1")
    let result = await authenticate.checkUserRole([UserRole.REPORTER])
    assert.equal(result instanceof Response, false)
    jar.set("userRole", UserRole.ADMIN)
    result = await authenticate.checkUserRole([UserRole.ADMIN])
    assert.equal(result instanceof Response && result.status, 403)
    jar.set("userId", "2")
    result = await authenticate.checkUserRole([UserRole.REPORTER])
    assert.equal(result instanceof Response && result.status, 401)
    jar.set("userId", "1")
    passwordHash = bcrypt.hashSync("test-new-password", 4)
    result = await authenticate.checkUserRole([UserRole.REPORTER])
    assert.equal(result instanceof Response && result.status, 401)
    assert.equal((await signIn("test-new-password")).status, 200)
    assert.notEqual(jar.get("session"), oldToken)
    actualRole = UserRole.WAREHOUSE
    result = await authenticate.checkUserRole([UserRole.WAREHOUSE])
    assert.equal(result instanceof Response, false)
    deleted = true
    result = await authenticate.checkUserRole([UserRole.WAREHOUSE])
    assert.equal(result instanceof Response && result.status, 401)
  } finally {
    if (oldSecret === undefined) delete process.env.AUTH_SESSION_SECRET
    else process.env.AUTH_SESSION_SECRET = oldSecret
  }
})

const png = () => new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "safe.png", { type: "image/png" })
function formRequest(files: File[], pending = false): Request {
  const form = new FormData()
  form.set("deviceSn", pending ? "PENDING_VERIFY" : "SN-1")
  form.set("faultDesc", "测试故障")
  form.set("modelName", "报修型号")
  form.set("quantity", "2")
  form.set("userId", "999")
  files.forEach(file => form.append("deviceImages", file))
  return new Request("http://localhost/api/tickets/create", { method: "POST", body: form })
}

function legacyFixture(fail?: "insert" | "audit" | "storage") {
  const state = { inventoryStatus: SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK as string, tickets: [] as Row[], history: [] as Row[] }
  let connectionCount = 0
  let begins = 0
  let commits = 0
  let rollbacks = 0
  let uploadCount = 0
  let inventoryReads = 0
  const files = new Set<string>()
  const removed: string[] = []
  const columns = ["Id", "DeviceSN", "ModelName", "Problem", "Status", "ReportByUserID", "BatchId", "ReportedBy",
    "DevicePhotos", "DamageImages", "Quantity", "TicketId", "WorkOrderNumber", "ReportTime", "SubmitDate", "MaterialCode"]
  class Transaction {
    snapshot = structuredClone(state)
    active = false
    async begin() { begins++; this.active = true }
    async commit() { commits++; Object.assign(state, this.snapshot); this.active = false }
    async rollback() { rollbacks++; this.active = false }
  }
  class SqlRequest {
    inputs: Row = {}
    constructor(private transaction?: Transaction) {}
    input(key: string, ...values: unknown[]) { this.inputs[key] = values.at(-1); return this }
    async query(text: string) {
      if (text.includes("INFORMATION_SCHEMA")) return { recordset: columns.map(COLUMN_NAME => ({ COLUMN_NAME })) }
      assert.ok(this.transaction?.active, "business operations must share the active transaction")
      const snapshot = this.transaction.snapshot
      if (text.includes("SELECT TOP 1 [SerialNumber]")) {
        inventoryReads++
        assert.equal(/DeviceType|ProjectLocation|Warehouse/.test(text), false)
        return { recordset: [{ SerialNumber: "SN-1", Status: snapshot.inventoryStatus, ModelName: "库存型号", MaterialCode: "M1" }] }
      }
      if (text.startsWith("UPDATE [dbo].[Device_Inventory]")) {
        snapshot.inventoryStatus = String(this.inputs.status)
        return { recordset: [] }
      }
      if (text.includes("INSERT INTO [dbo].[Repair_Tickets]")) {
        assert.equal(text.includes("FaultDescription"), false)
        assert.ok(text.includes("[Problem]"))
        if (fail === "insert") throw new Error("SYNTHETIC_PRIVATE_INSERT_FAILURE")
        snapshot.tickets.push({ ...this.inputs })
        return { recordset: [{ Id: 42 }] }
      }
      if (text.includes("INSERT INTO [dbo].[Repair_Ticket_History]")) {
        if (fail === "audit") throw new Error("SYNTHETIC_PRIVATE_AUDIT_FAILURE")
        snapshot.history.push({ ...this.inputs })
        return { recordset: [] }
      }
      throw new Error("Unexpected query")
    }
  }
  const pool = { request: () => new SqlRequest() }
  const handler = load<PostRoute>("app/api/tickets/create/route.ts", {
    mssql: { ...realRequire("mssql"), Request: SqlRequest, Transaction },
    "@/lib/auth-utils": {
      checkUserRole: async () => ({ userId: "1", normalizedRole: UserRole.REPORTER, username: "test", realName: "测试" }),
      isErrorResponse: () => false,
    },
    "@/lib/db-config": { getDbConnection: async () => { connectionCount++; return pool } },
    "@/lib/batch-number": { generateSequentialBatchId: async () => "20261004001" },
    "@/lib/storage/storage-adapter": { getStorageAdapter: () => ({
      upload: async (key: string) => {
        uploadCount++
        const path = `/uploads/${key}`; files.add(path)
        if (fail === "storage" && uploadCount === 2) throw new Error("SYNTHETIC_STORAGE_FAILURE")
        return path
      },
      delete: async (path: string) => { files.delete(path.startsWith("/uploads/") ? path : `/uploads/${path}`); removed.push(path) },
    }) },
  })
  return { handler, state, files, removed, stats: () => ({ connectionCount, begins, commits, rollbacks, uploadCount, inventoryReads }) }
}

test("真实旧create在DB/写文件之前拒HTML、伪装图片、多文件中任一非法项", async () => {
  const html = new File(["<html>synthetic</html>"], "unsafe.html", { type: "text/html" })
  const fakePng = new File(["<html>synthetic</html>"], "fake.png", { type: "image/png" })
  for (const files of [[html], [fakePng], [png(), html], Array.from({ length: 21 }, png)]) {
    const fixture = legacyFixture()
    const response = await fixture.handler.POST(formRequest(files))
    assert.equal(response.status, 400)
    assert.equal(fixture.stats().connectionCount, 0)
    assert.equal(fixture.files.size, 0)
  }
})

test("真实旧create正常SN成功：真实列写入、库存工单审计同事务、归属取认证身份", async () => {
  const fixture = legacyFixture()
  const response = await fixture.handler.POST(formRequest([png()]))
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { success: true, message: "报修工单创建成功", data: { id: 42, batchId: "20261004001" } })
  assert.equal(fixture.state.inventoryStatus, SPECIAL_VALUES.DEVICE_STATUS_REPAIRING)
  assert.equal(fixture.state.tickets[0].ReportByUserID, 1)
  assert.equal(fixture.state.tickets[0].Problem, "测试故障")
  assert.equal(fixture.state.history[0].operatorId, 1)
  assert.equal(fixture.files.size, 1)
  assert.equal(fixture.stats().commits, 1)
  assert.equal(fixture.stats().rollbacks, 0)
})

test("真实旧create写入/审计/第二文件上传失败均回滚业务状态并删除已写附件", async () => {
  for (const failure of ["insert", "audit", "storage"] as const) {
    const fixture = legacyFixture(failure)
    const response = await fixture.handler.POST(formRequest([png(), png()]))
    assert.equal(response.status, 500)
    assert.equal(JSON.stringify(await response.json()).includes("SYNTHETIC"), false)
    assert.equal(fixture.state.inventoryStatus, SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK)
    assert.equal(fixture.state.tickets.length, 0)
    assert.equal(fixture.state.history.length, 0)
    assert.equal(fixture.files.size, 0)
    assert.equal(fixture.removed.length, 2)
    assert.equal(fixture.stats().commits, 0)
    assert.equal(fixture.stats().rollbacks, 1)
  }
})

test("真实旧create保留待核验SN创建，仍生成批次、归属和日志", async () => {
  const fixture = legacyFixture()
  const response = await fixture.handler.POST(formRequest([], true))
  assert.equal(response.status, 201)
  assert.equal(fixture.state.tickets[0].DeviceSN, "PENDING")
  assert.equal(fixture.stats().inventoryReads, 0)
  assert.equal(fixture.state.history.length, 1)
})
