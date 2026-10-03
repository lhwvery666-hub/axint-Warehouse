/**
 * Execute the actual handlers with real visibility/access helpers. Only verified
 * identity and database adapters are substituted with synthetic in-memory data.
 * The SQL double interprets this suite's parameterized ownership predicates;
 * this does not validate a live SQL Server schema, deployment or browser UI.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import ts from "typescript"
import { UserRole, RepairAction, TicketActionType, TicketStatus } from "@/lib/enums"
import { canReadTicketBatch } from "@/lib/ticket-access"
import { projectTicketForViewer } from "@/lib/ticket-visibility"

const realRequire = createRequire(import.meta.url)
type Row = Record<string, unknown>
type Context = { params: Promise<Record<string, string>> }
type Handler = (request: Request, context: Context) => Promise<Response>
interface Route { GET: Handler; POST: Handler }

function loadRoute(file: string, dependencies: Record<string, unknown>): Route {
  const compiled = ts.transpileModule(readFileSync(resolve(file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const loadedModule = { exports: {} }
  const load = (id: string) => Object.hasOwn(dependencies, id)
    ? dependencies[id]
    : realRequire(id.startsWith("@/") ? resolve(`${id.slice(2)}.ts`) : id)
  new Function("require", "module", "exports", compiled)(load, loadedModule, loadedModule.exports)
  return loadedModule.exports as Route
}

function auth(role: UserRole = UserRole.REPORTER) {
  return { userId: "1", normalizedRole: role, userRole: role, realName: "测试用户", username: "test" }
}
function authModule(role: UserRole = UserRole.REPORTER) {
  return {
    ALL_USER_ROLES: Object.values(UserRole),
    checkUserRole: async () => auth(role),
    isErrorResponse: (value: unknown) => value instanceof Response,
  }
}
function poolFor(query: (text: string, inputs: Row) => Row[]) {
  return {
    request: () => {
      const inputs: Row = {}
      return {
        input(key: string, ...values: unknown[]) { inputs[key] = values.at(-1); return this },
        async query(text: string) { return { recordset: query(text, inputs) } },
      }
    },
  }
}
const context = (params: Record<string, string>): Context => ({ params: Promise.resolve(params) })
const request = (path: string) => new Request(`http://localhost${path}`)

test("批次级资源：现场只读全部属于本人的批次；四个内部岗位可读他人批次", () => {
  assert.equal(canReadTicketBatch(auth(), [{ ReportByUserID: 1 }]), true)
  for (const owners of [[], [{ ReportByUserID: 2 }], [{ ReportByUserID: 1 }, { ReportByUserID: 2 }], [{ ReportByUserID: null }]]) {
    assert.equal(canReadTicketBatch(auth(), owners), false)
  }
  for (const role of [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.WAREHOUSE, UserRole.BUSINESS]) {
    assert.equal(canReadTicketBatch(auth(role), [{ ReportByUserID: 2 }]), true)
  }
})

test("真实聊天GET/POST拒绝他人/混合批次且不读写消息，本人及内部岗位正常", async () => {
  for (const role of [UserRole.REPORTER, UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.WAREHOUSE, UserRole.BUSINESS]) {
    for (const owners of [[1], [2], [1, 2], []]) {
      let messageReads = 0
      let messageWrites = 0
      const pool = poolFor((sql) => {
        if (sql.includes("FROM [Repair_Tickets]")) return owners.map(id => ({ ReportByUserID: id }))
        if (sql.includes("INSERT INTO TicketMessage")) { messageWrites++; return [{ content: "新消息" }] }
        if (sql.includes("FROM TicketMessage")) { messageReads++; return [{ content: "批次消息" }] }
        throw new Error("Unexpected query")
      })
      const route = loadRoute("app/api/messages/route.ts", {
        "@/lib/auth-utils": authModule(role), "@/lib/db-config": { getDbConnection: async () => pool },
      })
      const allowed = owners.length > 0 && (role !== UserRole.REPORTER || owners.every(id => id === 1))
      const get = await route.GET(request("/api/messages?ticketId=B1"), context({}))
      const post = await route.POST(new Request("http://localhost/api/messages", {
        method: "POST", body: JSON.stringify({ ticketId: "B1", content: "新消息", senderName: "伪造" }),
      }), context({}))
      assert.equal(get.status, allowed ? 200 : 404)
      assert.equal(post.status, allowed ? 200 : 404)
      assert.equal(messageReads, allowed ? 1 : 0)
      assert.equal(messageWrites, allowed ? 1 : 0)
    }
  }
})

test("真实单件旧报告：他人ID被拒，自己的客户报价可读，内部备注不返回", async () => {
  for (const role of [UserRole.REPORTER, UserRole.ADMIN]) {
    const rows: Row[] = [1, 2].map(id => ({
      Id: id, ReportByUserID: id, DeviceSN: `SN${id}`, Quantity: 1,
      ModelName: "报修型号", ClientName: "客户", RepairCost: 88, RepairNotes: "INTERNAL_SUPPLIER_NOTE",
    }))
    const pool = poolFor((sql, inputs) => rows.filter(row => row.Id === inputs.id &&
      (!sql.includes("ReportByUserID = @reporterUserId") || row.ReportByUserID === inputs.reporterUserId)))
    const route = loadRoute("app/api/tickets/[id]/repair-report/route.ts", {
      "@/lib/auth-utils": authModule(role), "@/lib/db-config": { getDbConnection: async () => pool },
    })
    const own = await route.GET(request("/api/tickets/1/repair-report"), context({ id: "1" }))
    assert.equal(own.status, 200)
    const body = await own.json()
    assert.equal(body.data.totalCost, 88)
    assert.equal(JSON.stringify(body).includes("INTERNAL_SUPPLIER_NOTE"), role !== UserRole.REPORTER)
    const other = await route.GET(request("/api/tickets/2/repair-report"), context({ id: "2" }))
    assert.equal(other.status, role === UserRole.REPORTER ? 404 : 200)
  }
})

test("聊天ticketId继续按批次字符串处理，纯数字批次号不会误作单设备ID", async () => {
  const batchId = "20261004001"
  const seen: unknown[] = []
  const pool = poolFor((sql, inputs) => {
    if (sql.includes("FROM [Repair_Tickets]")) {
      seen.push(inputs.batchId)
      return inputs.batchId === batchId ? [{ ReportByUserID: 1 }] : []
    }
    seen.push(inputs.ticketId)
    return [{ ticketId: inputs.ticketId, content: "test" }]
  })
  const route = loadRoute("app/api/messages/route.ts", {
    "@/lib/auth-utils": authModule(), "@/lib/db-config": { getDbConnection: async () => pool },
  })
  assert.equal((await route.GET(request(`/api/messages?ticketId=${batchId}`), context({}))).status, 200)
  assert.equal((await route.POST(new Request("http://localhost/api/messages", {
    method: "POST", body: JSON.stringify({ ticketId: batchId, content: "test" }),
  }), context({}))).status, 200)
  assert.deepEqual(seen, [batchId, batchId, batchId, batchId])
})

test("真实操作日志：先验归属；现场无内部说明/返厂动作/返厂状态", async () => {
  for (const role of [UserRole.REPORTER, UserRole.TECHNICIAN]) {
    for (const owner of [1, 2]) {
      let historyReads = 0
      const route = loadRoute("app/api/tickets/batch-operation-logs/[batchId]/route.ts", {
        "@/lib/auth-utils": authModule(role),
        "@/lib/prisma": { prisma: {
          repair_Tickets: { findMany: async () => [{ ReportByUserID: owner }] },
          repair_Ticket_History: { findMany: async () => {
            historyReads++
            return [
              { actionType: TicketActionType.BATCH_UPDATED, createdAt: new Date(), operatorName: "维修", description: "INTERNAL_SUPPLIER_WITHOUT_KEYWORD" },
              { actionType: TicketActionType.RMA_REQUEST, createdAt: new Date(), operatorName: "维修", description: "返厂运单 123" },
            ]
          } },
          $queryRaw: async () => [{ CurrentStatus: TicketStatus.PENDING_FACTORY }],
        } },
      })
      const response = await route.GET(request("/logs"), context({ batchId: "B1" }))
      if (role === UserRole.REPORTER && owner === 2) {
        assert.equal(response.status, 404)
        assert.equal(historyReads, 0)
      } else {
        assert.equal(response.status, 200)
        const body = await response.json()
        assert.equal(body.data.operations.length, role === UserRole.REPORTER ? 1 : 2)
        assert.equal(body.data.currentStatus, role === UserRole.REPORTER ? TicketStatus.TECHNICIAN_REPAIRING : TicketStatus.PENDING_FACTORY)
        assert.equal(JSON.stringify(body).includes("INTERNAL_SUPPLIER_WITHOUT_KEYWORD"), role !== UserRole.REPORTER)
      }
    }
  }
})

test("真实SN查询和型号目录：现场保留报修型号，不返回内部库存/厂商/产品资料", async () => {
  const inventory = {
    serialNumber: "SN", modelName: "报修型号", category: "分类", subCategory: "子类",
    deviceName: "INTERNAL_NAME", materialCode: "INTERNAL_CODE", specification: "INTERNAL_SPEC",
    status: "In Stock", location: "INTERNAL_LOCATION",
  }
  const catalog = {
    productId: 1, modelName: "报修型号", category: "分类", subCategory: "子类",
    modelCode: "INTERNAL_CODE", specification: "INTERNAL_SPEC", manufacturer: "INTERNAL_VENDOR",
  }
  for (const role of [UserRole.REPORTER, UserRole.WAREHOUSE]) {
    const dependencies = {
      "@/lib/auth-utils": authModule(role),
      "@/lib/prisma": { prisma: {
        device_Inventory: { findUnique: async () => inventory },
        product_Catalog: { findMany: async () => [catalog] },
      } },
    }
    for (const file of ["app/api/device/check/route.ts", "app/api/models/route.ts"]) {
      const response = await loadRoute(file, dependencies).GET(request("/lookup?sn=SN"), context({}))
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(JSON.stringify(body).includes("报修型号"), true)
      assert.equal(JSON.stringify(body).includes("INTERNAL_"), role !== UserRole.REPORTER)
    }
  }
})

test("真实批量报告：返厂设备仍显示客户报价，内部产品及原始备注不返回", async () => {
  const row = {
    Id: 1, DeviceSN: "SN", ModelName: "报修型号", Quantity: 2,
    DeviceName: "INTERNAL_NAME", MaterialCode: "INTERNAL_CODE", FullSpec: "INTERNAL_SPEC",
    FaultPoint: "INTERNAL_FAULT_NOTE", RepairNotes: "INTERNAL_VENDOR_NOTE", RepairCost: 300,
    RepairAction: RepairAction.RMA, Status: TicketStatus.PENDING_FACTORY, FactoryRepairDate: new Date(),
    RepairReportContent: JSON.stringify({ repairContent: "客户报告维修内容", improvements: "客户建议" }),
  }
  for (const role of [UserRole.REPORTER, UserRole.BUSINESS]) {
    const pool = poolFor(() => [row])
    const route = loadRoute("app/api/tickets/batch-repair-report/[batchId]/route.ts", {
      "@/lib/auth-utils": authModule(role), "@/lib/db-config": { getDbConnection: async () => pool },
    })
    const response = await route.GET(request("/report"), context({ batchId: "B1" }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.data.totalCost, 300)
    assert.equal(body.data.devices[0].repairContent, "客户报告维修内容")
    assert.equal(JSON.stringify(body).includes("INTERNAL_"), role !== UserRole.REPORTER)
  }
})

test("共享字段投影不按返厂类别隐藏客户报价或正常客户物流", () => {
  const source = {
    modelName: "报修型号", deviceSerialNumber: "SN", quantity: 2, repairCost: 300,
    returnTrackingNum: "客户运单", returnDate: "2026-10-04", signedReportPhoto: "/uploads/sign.jpg",
    deviceName: "INTERNAL", materialCode: "INTERNAL", fullSpec: "INTERNAL", supplierName: "INTERNAL",
    factoryTrackingNum: "INTERNAL", repairNotes: "INTERNAL", faultPoint: "INTERNAL",
  }
  const publicData = projectTicketForViewer(source, UserRole.REPORTER)
  assert.equal(JSON.stringify(publicData).includes("INTERNAL"), false)
  assert.equal(publicData.repairCost, 300)
  assert.equal(publicData.returnTrackingNum, "客户运单")
  assert.equal(publicData.signedReportPhoto, "/uploads/sign.jpg")
  assert.equal(projectTicketForViewer(source, UserRole.ADMIN), source)
})

test("真实客户物流接口：现场可查自己的客户运单，不能查他人或混合归属批次", async () => {
  for (const role of [UserRole.REPORTER, UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.WAREHOUSE, UserRole.BUSINESS]) {
    for (const owners of [[1], [2], [1, 2]]) {
      const pool = poolFor(() => owners.map((owner, index) => ({
        Id: index + 1, Quantity: 2, ReportByUserID: owner, RepairReportContent: null,
        ShippingType: "return", ReturnTrackingNum: "CUSTOMER_TRACKING", ReturnDate: new Date(),
      })))
      const route = loadRoute("app/api/tickets/shipping-info/[batchId]/route.ts", {
        "@/lib/auth-utils": authModule(role), "@/lib/db-config": { getDbConnection: async () => pool },
      })
      const response = await route.GET(request("/shipping"), context({ batchId: "B1" }))
      const allowed = role !== UserRole.REPORTER || owners.every(owner => owner === 1)
      assert.equal(response.status, allowed ? 200 : 404)
      if (allowed) {
        const body = await response.json()
        assert.equal(body.data.returnTrackingNum, "CUSTOMER_TRACKING")
        assert.equal(body.data.returnQuantity, owners.length * 2)
      }
    }
  }
})

test("真实批次详情：本人过滤与字段投影同时执行，签字链接/数量/最终结果保留", async () => {
  const rows: Row[] = [1, 2].map(id => ({
    Id: id, ReportByUserID: id, DeviceSN: `SN${id}`, ModelName: "报修型号", Quantity: 3,
    DeviceName: "INTERNAL_NAME", MaterialCode: "INTERNAL_CODE", FullSpec: "INTERNAL_SPEC",
    FaultPoint: "INTERNAL_NOTE", FactoryTrackingNum: "INTERNAL_TRACKING", Status: TicketStatus.PENDING_FACTORY,
    RepairAction: RepairAction.RMA, SignedReportPhoto: "/uploads/public-sign.jpg",
    RepairReportContent: JSON.stringify({ finalOutcome: "REPAIRED" }),
  }))
  for (const role of [UserRole.REPORTER, UserRole.TECHNICIAN]) {
    const pool = poolFor((sql, inputs) => rows.filter(row =>
      !sql.includes("AND [ReportByUserID] = @userId") || row.ReportByUserID === inputs.userId))
    const route = loadRoute("app/api/tickets/batch-devices/[batchId]/route.ts", {
      "@/lib/auth-utils": authModule(role), "@/lib/db-config": { getDbConnection: async () => pool },
    })
    const response = await route.GET(request("/batch"), context({ batchId: "B1" }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.data.devices.length, role === UserRole.REPORTER ? 1 : 2)
    assert.equal(body.data.devices[0].quantity, 3)
    assert.equal(body.data.devices[0].finalOutcome, "REPAIRED")
    assert.equal(body.data.batchInfo.signedReportPhoto, "/uploads/public-sign.jpg")
    assert.equal(JSON.stringify(body).includes("INTERNAL_"), role !== UserRole.REPORTER)
  }
})

test("真实附件清单保持本人权限，允许本人拿到可分享的免登录附件链接", async () => {
  for (const owner of [1, 2]) {
    let attachmentReads = 0
    const pool = poolFor((sql) => {
      if (sql.includes("FROM [dbo].[Repair_Tickets]")) return [{ ReportByUserID: owner }]
      if (sql.includes("FROM [dbo].[Batch_Stamp_Attachments]")) {
        attachmentReads++
        return [{ Id: 1, FilePath: "/uploads/public-attachment.pdf", OriginalName: "签字件.pdf" }]
      }
      throw new Error("Unexpected query")
    })
    const route = loadRoute("app/api/tickets/batch-attachments/[batchId]/route.ts", {
      "@/lib/auth-utils": authModule(), "@/lib/db-config": { getDbConnection: async () => pool },
      "@/lib/storage/storage-adapter": {}, "@/lib/storage/upload-security": {},
    })
    const response = await route.GET(request("/attachments"), context({ batchId: "B1" }))
    assert.equal(response.status, owner === 1 ? 200 : 403)
    assert.equal(attachmentReads, owner === 1 ? 1 : 0)
    if (owner === 1) assert.equal((await response.json()).data[0].filePath, "/uploads/public-attachment.pdf")
  }
})
