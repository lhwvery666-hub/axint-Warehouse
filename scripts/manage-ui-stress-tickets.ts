import * as sql from "mssql"

import { closeDbConnection, getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"

const FIXTURE_BATCH_PREFIX = "WOUISTRESS-"
const FIXTURE_BATCH_PATTERN = `${FIXTURE_BATCH_PREFIX}%`
const FIXTURE_PROJECT_PREFIX = "[UI压力测试]"
const FIXTURE_MARKER = "CODEX_UI_STRESS_FIXTURE_V1"
const TOTAL_TICKETS = 100

const WORKFLOW_STATUSES = [
  TicketStatus.CREATED,
  TicketStatus.WAREHOUSE_CONFIRMING,
  TicketStatus.WAREHOUSE_CONFIRMED,
  TicketStatus.IN_REPAIR,
  TicketStatus.PENDING_REPORTER_CONFIRM,
  TicketStatus.TECHNICIAN_REPAIRING,
  TicketStatus.BUSINESS_REVIEW,
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.COMPLETED,
] as const

const MODEL_NAMES = ["AX-7CW", "NC100-1M", "TR2240603", "K20S2040157"] as const
const PRIORITIES = ["low", "medium", "high"] as const

const REQUIRED_COLUMNS = {
  Repair_Tickets: [
    "Id",
    "DeviceSN",
    "Status",
    "Priority",
    "CreatedAt",
    "UpdatedAt",
    "ModelName",
    "DeviceName",
    "Problem",
    "ProjectLocation",
    "MaterialCode",
    "ContactInfo",
    "TrackingNumber_In",
    "ReportByUserID",
    "ProjectName",
    "ClientName",
    "SubmitDate",
    "Quantity",
    "Category",
    "SubCategory",
    "FaultPoint",
    "IsChargeable",
    "RepairCost",
    "IsInvoiced",
    "ReceivedDate",
    "IsPaymentReceived",
    "ManufactureDate",
    "WarehouseConfirmedAt",
    "WarehouseConfirmedBy",
    "ReporterConfirmedAt",
    "TechnicianCompletedAt",
    "TechnicianCompletedBy",
    "BusinessReviewedAt",
    "BusinessReviewedBy",
    "WarehouseShippedAt",
    "WarehouseShippedBy",
    "BatchId",
    "WorkOrderNumber",
    "RepairReportContent",
    "RepairNotes",
  ],
  Repair_Ticket_History: [
    "TicketID",
    "ActionType",
    "OldStatus",
    "NewStatus",
    "ActionBy",
    "ActionNote",
    "CreatedAt",
    "BatchId",
    "OperatorId",
    "OperatorName",
    "Description",
  ],
  Users: ["UserID", "Username", "Role", "RealName", "IsDeleted"],
} as const

type Command = "audit" | "seed" | "cleanup"

interface ColumnRow {
  TABLE_NAME: string
  COLUMN_NAME: string
}

interface ReporterRow {
  UserID: number
  Username: string
  RealName: string | null
}

interface InsertedTicketRow {
  Id: number
}

interface StatusCountRow {
  Status: string
  count: number
}

interface FixtureAudit {
  total: number
  histories: number
  minCreatedAt: Date | null
  maxCreatedAt: Date | null
  statuses: Record<string, number>
}

function parseCommand(value: string | undefined): Command {
  if (!value || value === "audit") return "audit"
  if (value === "seed" || value === "cleanup") return value
  throw new Error("Usage: tsx scripts/manage-ui-stress-tickets.ts [audit|seed|cleanup]")
}

async function assertRuntimeSchema(pool: sql.ConnectionPool): Promise<void> {
  const result = await pool.request().query<ColumnRow>(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME IN ('Repair_Tickets', 'Repair_Ticket_History', 'Users')
  `)
  const actual = new Map<string, Set<string>>()

  for (const row of result.recordset) {
    const columns = actual.get(row.TABLE_NAME) ?? new Set<string>()
    columns.add(row.COLUMN_NAME)
    actual.set(row.TABLE_NAME, columns)
  }

  const missing: string[] = []
  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const actualColumns = actual.get(tableName)
    for (const columnName of requiredColumns) {
      if (!actualColumns?.has(columnName)) missing.push(`${tableName}.${columnName}`)
    }
  }

  if (missing.length > 0) {
    throw new Error(`UI stress fixture schema check failed: ${missing.join(", ")}`)
  }
}

async function readFixtureAudit(
  requestFactory: () => sql.Request,
): Promise<FixtureAudit> {
  const ticketResult = await requestFactory()
    .input("batchPattern", sql.NVarChar(50), FIXTURE_BATCH_PATTERN)
    .input("projectPrefix", sql.NVarChar(200), FIXTURE_PROJECT_PREFIX)
    .query<{ total: number; minCreatedAt: Date | null; maxCreatedAt: Date | null }>(`
      SELECT
        COUNT(*) AS total,
        MIN(CreatedAt) AS minCreatedAt,
        MAX(CreatedAt) AS maxCreatedAt
      FROM dbo.Repair_Tickets
      WHERE BatchId LIKE @batchPattern
        AND LEFT(ProjectName, LEN(@projectPrefix)) = @projectPrefix
    `)

  const statusResult = await requestFactory()
    .input("batchPattern", sql.NVarChar(50), FIXTURE_BATCH_PATTERN)
    .input("projectPrefix", sql.NVarChar(200), FIXTURE_PROJECT_PREFIX)
    .query<StatusCountRow>(`
      SELECT Status, COUNT(*) AS count
      FROM dbo.Repair_Tickets
      WHERE BatchId LIKE @batchPattern
        AND LEFT(ProjectName, LEN(@projectPrefix)) = @projectPrefix
      GROUP BY Status
      ORDER BY Status
    `)

  const historyResult = await requestFactory()
    .input("batchPattern", sql.NVarChar(50), FIXTURE_BATCH_PATTERN)
    .input("projectPrefix", sql.NVarChar(200), FIXTURE_PROJECT_PREFIX)
    .query<{ histories: number }>(`
      SELECT COUNT(*) AS histories
      FROM dbo.Repair_Ticket_History AS h
      INNER JOIN dbo.Repair_Tickets AS t ON t.BatchId = h.BatchId
      WHERE t.BatchId LIKE @batchPattern
        AND LEFT(t.ProjectName, LEN(@projectPrefix)) = @projectPrefix
    `)

  const ticketSummary = ticketResult.recordset[0]
  return {
    total: Number(ticketSummary?.total ?? 0),
    histories: Number(historyResult.recordset[0]?.histories ?? 0),
    minCreatedAt: ticketSummary?.minCreatedAt ?? null,
    maxCreatedAt: ticketSummary?.maxCreatedAt ?? null,
    statuses: Object.fromEntries(
      statusResult.recordset.map((row) => [row.Status, Number(row.count)]),
    ),
  }
}

function buildReportContent(index: number, modelName: string, deviceSn: string, cost: number): string {
  return JSON.stringify({
    items: [{
      deviceModel: modelName,
      quantity: 1,
      serialNumber: deviceSn,
      repairContent: `UI 压力测试维修内容 ${index + 1}`,
      repairCost: cost,
      improvements: "用于长列表滚动和流程页面验收",
    }],
    totalQuantity: 1,
    totalCost: cost,
    remarks: FIXTURE_MARKER,
    customerName: `${FIXTURE_PROJECT_PREFIX}客户-${String((index % 10) + 1).padStart(2, "0")}`,
    projectName: `${FIXTURE_PROJECT_PREFIX}滚动与筛选验收`,
    contactInfo: `测试联系人 ${13800000000 + index}`,
    from: "ui-stress-fixture",
    isOutOfWarranty: index % 3 === 0 ? "否" : "是",
  })
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

async function seedFixtures(pool: sql.ConnectionPool): Promise<void> {
  const before = await readFixtureAudit(() => pool.request())
  if (before.total === TOTAL_TICKETS) {
    console.log("UI stress fixtures already exist; seed skipped.")
    console.log(JSON.stringify(before, null, 2))
    return
  }
  if (before.total !== 0) {
    throw new Error(`Found ${before.total} partial UI stress fixtures. Run cleanup before reseeding.`)
  }

  const reporterResult = await pool.request()
    .input("reporterRole", sql.NVarChar(50), UserRole.REPORTER)
    .query<ReporterRow>(`
      SELECT TOP (1) UserID, Username, RealName
      FROM dbo.Users
      WHERE LOWER(Role) = @reporterRole
        AND COALESCE(IsDeleted, 0) = 0
      ORDER BY UserID
    `)
  const reporter = reporterResult.recordset[0]
  if (!reporter) throw new Error("No active reporter user is available for the UI stress fixtures.")

  let transaction: sql.Transaction | null = new sql.Transaction(pool)
  await transaction.begin()

  try {
    const now = new Date()
    const activeTransaction = transaction

    for (let index = 0; index < TOTAL_TICKETS; index += 1) {
      const workflowIndex = index % WORKFLOW_STATUSES.length
      const status = WORKFLOW_STATUSES[workflowIndex]
      const previousStatus = workflowIndex > 0 ? WORKFLOW_STATUSES[workflowIndex - 1] : null
      const batchId = `${FIXTURE_BATCH_PREFIX}${String(index + 1).padStart(4, "0")}`
      const deviceSn = `UI-STRESS-SN-${String(index + 1).padStart(4, "0")}`
      const modelName = MODEL_NAMES[index % MODEL_NAMES.length]
      const createdAt = addHours(now, -(TOTAL_TICKETS - index) * 6)
      const receivedDate = workflowIndex >= 1 ? addHours(createdAt, 1) : null
      const manufactureDate = workflowIndex >= 2 ? addHours(createdAt, -24 * (365 + index)) : null
      const warehouseConfirmedAt = workflowIndex >= 2 ? addHours(createdAt, 2) : null
      const reporterConfirmedAt = workflowIndex >= 5 ? addHours(createdAt, 5) : null
      const technicianCompletedAt = workflowIndex >= 6 ? addHours(createdAt, 8) : null
      const businessReviewedAt = workflowIndex >= 7 ? addHours(createdAt, 10) : null
      const warehouseShippedAt = workflowIndex >= 8 ? addHours(createdAt, 12) : null
      const chargeable = index % 3 !== 0
      const repairCost = chargeable ? 120 + (index % 12) * 35 : 0
      const hasReport = workflowIndex >= 4

      const inserted = await new sql.Request(activeTransaction)
        .input("deviceSn", sql.NVarChar(100), deviceSn)
        .input("status", sql.NVarChar(50), status)
        .input("priority", sql.NVarChar(20), PRIORITIES[index % PRIORITIES.length])
        .input("createdAt", sql.DateTime2, createdAt)
        .input("updatedAt", sql.DateTime2, warehouseShippedAt ?? businessReviewedAt ?? technicianCompletedAt ?? reporterConfirmedAt ?? warehouseConfirmedAt ?? createdAt)
        .input("modelName", sql.NVarChar(200), modelName)
        .input("deviceName", sql.NVarChar(200), `测试设备 ${modelName}`)
        .input("problem", sql.NVarChar(sql.MAX), `模拟故障 ${index + 1}：用于检验滚动动画、筛选与卡片交互`)
        .input("projectLocation", sql.NVarChar(200), `压力测试区域 ${(index % 5) + 1}`)
        .input("materialCode", sql.NVarChar(100), `MAT-UI-${String((index % 20) + 1).padStart(3, "0")}`)
        .input("contactInfo", sql.NVarChar(200), `测试联系人 ${(index % 10) + 1} 13${String(800000000 + index).padStart(9, "0")}`)
        .input("trackingNumberIn", sql.NVarChar(100), `UIEXPRESS${String(index + 1).padStart(8, "0")}`)
        .input("reportByUserId", sql.Int, reporter.UserID)
        .input("projectName", sql.NVarChar(500), `${FIXTURE_PROJECT_PREFIX}客户-${String((index % 10) + 1).padStart(2, "0")}`)
        .input("clientName", sql.NVarChar(200), `${FIXTURE_PROJECT_PREFIX}客户-${String((index % 10) + 1).padStart(2, "0")}`)
        .input("submitDate", sql.DateTime2, createdAt)
        .input("quantity", sql.Int, 1)
        .input("category", sql.NVarChar(200), "UI压力测试设备")
        .input("subCategory", sql.NVarChar(200), `测试子类 ${(index % 4) + 1}`)
        .input("faultPoint", sql.NVarChar(500), hasReport ? `模拟故障点 ${(index % 8) + 1}` : null)
        .input("isChargeable", sql.Bit, chargeable)
        .input("repairCost", sql.Decimal(18, 2), repairCost)
        .input("isInvoiced", sql.Bit, workflowIndex >= 7 && index % 2 === 0)
        .input("receivedDate", sql.DateTime2, receivedDate)
        .input("isPaymentReceived", sql.Bit, workflowIndex >= 7 && (chargeable || repairCost === 0))
        .input("manufactureDate", sql.DateTime2, manufactureDate)
        .input("warehouseConfirmedAt", sql.DateTime2, warehouseConfirmedAt)
        .input("warehouseConfirmedBy", sql.NVarChar(100), warehouseConfirmedAt ? "UI压力测试-仓库" : null)
        .input("reporterConfirmedAt", sql.DateTime2, reporterConfirmedAt)
        .input("technicianCompletedAt", sql.DateTime2, technicianCompletedAt)
        .input("technicianCompletedBy", sql.NVarChar(100), technicianCompletedAt ? "UI压力测试-维修" : null)
        .input("businessReviewedAt", sql.DateTime2, businessReviewedAt)
        .input("businessReviewedBy", sql.NVarChar(100), businessReviewedAt ? "UI压力测试-商务" : null)
        .input("warehouseShippedAt", sql.DateTime2, warehouseShippedAt)
        .input("warehouseShippedBy", sql.NVarChar(100), warehouseShippedAt ? "UI压力测试-仓库" : null)
        .input("batchId", sql.NVarChar(50), batchId)
        .input("workOrderNumber", sql.NVarChar(50), batchId)
        .input("repairReportContent", sql.NVarChar(sql.MAX), hasReport ? buildReportContent(index, modelName, deviceSn, repairCost) : null)
        .input("repairNotes", sql.NVarChar(sql.MAX), FIXTURE_MARKER)
        .query<InsertedTicketRow>(`
          INSERT INTO dbo.Repair_Tickets (
            DeviceSN, Status, Priority, CreatedAt, UpdatedAt,
            ModelName, DeviceName, Problem, ProjectLocation, MaterialCode,
            ContactInfo, TrackingNumber_In, ReportByUserID, ProjectName, ClientName,
            SubmitDate, Quantity, Category, SubCategory, FaultPoint,
            IsChargeable, RepairCost, IsInvoiced, ReceivedDate, IsPaymentReceived,
            ManufactureDate, WarehouseConfirmedAt, WarehouseConfirmedBy, ReporterConfirmedAt,
            TechnicianCompletedAt, TechnicianCompletedBy, BusinessReviewedAt, BusinessReviewedBy,
            WarehouseShippedAt, WarehouseShippedBy, BatchId, WorkOrderNumber,
            RepairReportContent, RepairNotes
          )
          OUTPUT INSERTED.Id
          VALUES (
            @deviceSn, @status, @priority, @createdAt, @updatedAt,
            @modelName, @deviceName, @problem, @projectLocation, @materialCode,
            @contactInfo, @trackingNumberIn, @reportByUserId, @projectName, @clientName,
            @submitDate, @quantity, @category, @subCategory, @faultPoint,
            @isChargeable, @repairCost, @isInvoiced, @receivedDate, @isPaymentReceived,
            @manufactureDate, @warehouseConfirmedAt, @warehouseConfirmedBy, @reporterConfirmedAt,
            @technicianCompletedAt, @technicianCompletedBy, @businessReviewedAt, @businessReviewedBy,
            @warehouseShippedAt, @warehouseShippedBy, @batchId, @workOrderNumber,
            @repairReportContent, @repairNotes
          )
        `)

      const ticketId = inserted.recordset[0]?.Id
      if (!ticketId) throw new Error(`Failed to read inserted ticket ID for ${batchId}`)

      await new sql.Request(activeTransaction)
        .input("ticketId", sql.NVarChar(50), String(ticketId))
        .input("actionType", sql.NVarChar(50), workflowIndex === 0 ? TicketActionType.BATCH_CREATED : TicketActionType.STATUS_CHANGE)
        .input("oldStatus", sql.NVarChar(50), previousStatus)
        .input("newStatus", sql.NVarChar(50), status)
        .input("actionBy", sql.NVarChar(100), reporter.Username)
        .input("actionNote", sql.NVarChar(sql.MAX), `${FIXTURE_MARKER}: workflow fixture`)
        .input("createdAt", sql.DateTime2, createdAt)
        .input("batchId", sql.NVarChar(50), batchId)
        .input("operatorId", sql.Int, reporter.UserID)
        .input("operatorName", sql.NVarChar(100), reporter.RealName ?? reporter.Username)
        .input("description", sql.NVarChar(sql.MAX), `${FIXTURE_MARKER}: seeded at ${status}`)
        .query(`
          INSERT INTO dbo.Repair_Ticket_History (
            TicketID, ActionType, OldStatus, NewStatus, ActionBy, ActionNote,
            CreatedAt, BatchId, OperatorId, OperatorName, Description
          )
          VALUES (
            @ticketId, @actionType, @oldStatus, @newStatus, @actionBy, @actionNote,
            @createdAt, @batchId, @operatorId, @operatorName, @description
          )
        `)
    }

    const insideTransaction = await readFixtureAudit(() => new sql.Request(activeTransaction))
    if (insideTransaction.total !== TOTAL_TICKETS || insideTransaction.histories !== TOTAL_TICKETS) {
      throw new Error(`Fixture verification failed before commit: ${JSON.stringify(insideTransaction)}`)
    }

    await activeTransaction.commit()
    transaction = null
  } catch (error: unknown) {
    if (transaction) {
      try {
        await transaction.rollback()
      } finally {
        transaction = null
      }
    }
    throw error
  }

  const after = await readFixtureAudit(() => pool.request())
  console.log(`Created ${after.total} UI stress tickets for reporter ${reporter.Username}.`)
  console.log(JSON.stringify(after, null, 2))
}

async function cleanupFixtures(pool: sql.ConnectionPool): Promise<void> {
  const before = await readFixtureAudit(() => pool.request())
  if (before.total === 0) {
    console.log("No UI stress fixtures found; cleanup skipped.")
    return
  }
  if (before.total > TOTAL_TICKETS) {
    throw new Error(`Refusing cleanup: fixture selector matched ${before.total} tickets, expected at most ${TOTAL_TICKETS}.`)
  }

  let transaction: sql.Transaction | null = new sql.Transaction(pool)
  await transaction.begin()

  try {
    const activeTransaction = transaction
    const bindFixtureSelector = (request: sql.Request) => request
      .input("batchPattern", sql.NVarChar(50), FIXTURE_BATCH_PATTERN)
      .input("projectPrefix", sql.NVarChar(200), FIXTURE_PROJECT_PREFIX)

    await bindFixtureSelector(new sql.Request(activeTransaction)).query(`
      DELETE m
      FROM dbo.TicketMessage AS m
      INNER JOIN dbo.Repair_Tickets AS t ON m.TicketId = CAST(t.Id AS NVARCHAR(100))
      WHERE t.BatchId LIKE @batchPattern
        AND LEFT(t.ProjectName, LEN(@projectPrefix)) = @projectPrefix
    `)

    await bindFixtureSelector(new sql.Request(activeTransaction)).query(`
      DELETE a
      FROM dbo.Batch_Stamp_Attachments AS a
      INNER JOIN dbo.Repair_Tickets AS t ON t.BatchId = a.BatchId
      WHERE t.BatchId LIKE @batchPattern
        AND LEFT(t.ProjectName, LEN(@projectPrefix)) = @projectPrefix
    `)

    await bindFixtureSelector(new sql.Request(activeTransaction)).query(`
      DELETE h
      FROM dbo.Repair_Ticket_History AS h
      INNER JOIN dbo.Repair_Tickets AS t ON t.BatchId = h.BatchId
      WHERE t.BatchId LIKE @batchPattern
        AND LEFT(t.ProjectName, LEN(@projectPrefix)) = @projectPrefix
    `)

    await bindFixtureSelector(new sql.Request(activeTransaction)).query(`
      DELETE FROM dbo.Repair_Tickets
      WHERE BatchId LIKE @batchPattern
        AND LEFT(ProjectName, LEN(@projectPrefix)) = @projectPrefix
    `)

    const insideTransaction = await readFixtureAudit(() => new sql.Request(activeTransaction))
    if (insideTransaction.total !== 0 || insideTransaction.histories !== 0) {
      throw new Error(`Fixture cleanup verification failed before commit: ${JSON.stringify(insideTransaction)}`)
    }

    await activeTransaction.commit()
    transaction = null
  } catch (error: unknown) {
    if (transaction) {
      try {
        await transaction.rollback()
      } finally {
        transaction = null
      }
    }
    throw error
  }

  console.log(`Removed ${before.total} UI stress tickets and their related database records.`)
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2])
  const pool = await getDbConnection()

  try {
    await assertRuntimeSchema(pool)

    if (command === "seed") {
      await seedFixtures(pool)
      return
    }
    if (command === "cleanup") {
      await cleanupFixtures(pool)
      return
    }

    console.log(JSON.stringify(await readFixtureAudit(() => pool.request()), null, 2))
  } finally {
    await closeDbConnection()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "UI stress fixture command failed")
  process.exitCode = 1
})
