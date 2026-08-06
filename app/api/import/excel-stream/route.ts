import * as sql from "mssql"
import * as XLSX from "xlsx"
import { z } from "zod"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { getDbConnection } from "@/lib/db-config"
import {
  DEFAULT_DEVICE_IMPORT_PURPOSE,
  DEVICE_IMPORT_PURPOSES,
  DEVICE_IMPORT_MODES,
  getDeviceImportErrorMessage,
  getImportPurposeFromLegacyDefaultStatus,
  getNewDeviceStatusForImportPurpose,
  isRecordOnlyDeviceImport,
  NEW_DEVICE_DEFAULT_STATUSES,
  parseDeviceImportRows,
  validateDeviceImportFile,
  type DeviceImportPurpose,
  type DeviceImportParseResult,
  type DeviceImportRecord,
} from "@/lib/device-import"
import { UserRole } from "@/lib/enums"

const importRequestSchema = z.object({
  mode: z.enum(DEVICE_IMPORT_MODES).default("preview"),
  purpose: z.enum(DEVICE_IMPORT_PURPOSES).optional(),
  defaultStatus: z.enum(NEW_DEVICE_DEFAULT_STATUSES).optional(),
})

interface ImportPreviewStats {
  totalRows: number
  validRecords: number
  skippedRows: number
  identicalDuplicateRows: number
  conflictingDuplicateRows: number
  existingDevices: number
  existingDevicesPreserved: number
  newDevices: number
  newDevicesUsingDefaultStatus: number
  newDevicesWithoutInventoryStatus: number
  modelsToAdd: number
}

interface ImportExecutionStats {
  totalRows: number
  validRecords: number
  skippedRows: number
  identicalDuplicateRows: number
  conflictingDuplicateRows: number
  modelsAdded: number
  modelsSkipped: number
  devicesInserted: number
  devicesUpdated: number
  devicesPreserved: number
  devicesProcessed: number
}

interface ImportEventData {
  stage: "parsing" | "validating" | "preview" | "importing" | "complete" | "error"
  progress?: number
  total?: number
  percentage?: number
  preview?: ImportPreviewStats
  stats?: ImportExecutionStats
  conflicts?: DeviceImportParseResult["conflicts"]
}

interface ExistingDeviceRow {
  SerialNumber: string
}

interface ExistingModelRow {
  ModelName: string
}

interface ImportWriteResultRow {
  DevicesUpdated: number
  DevicesInserted: number
  DevicesPreserved: number
}

interface CatalogWriteResultRow {
  ModelsAdded: number
}

function sendEvent(
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController<Uint8Array>,
  success: boolean,
  message: string,
  data: ImportEventData
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ success, message, data })}\n\n`))
}

function normalizeKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleUpperCase("en-US")
}

function getDistinctModels(records: readonly DeviceImportRecord[]): string[] {
  const models = new Map<string, string>()
  for (const record of records) {
    const modelName = record.modelName.trim()
    if (!models.has(normalizeKey(modelName))) {
      models.set(normalizeKey(modelName), modelName)
    }
  }
  return Array.from(models.values())
}

async function buildPreview(
  parsed: DeviceImportParseResult,
  totalRows: number,
  purpose: DeviceImportPurpose
): Promise<ImportPreviewStats> {
  const pool = await getDbConnection()
  const [deviceResult, modelResult] = await Promise.all([
    pool.request().query<ExistingDeviceRow>(`
      SELECT [SerialNumber]
      FROM [dbo].[Device_Inventory];
    `),
    pool.request().query<ExistingModelRow>(`
      SELECT [ModelName]
      FROM [dbo].[Product_Catalog];
    `),
  ])
  const existingSerialNumbers = new Set(
    deviceResult.recordset.map((row) => normalizeKey(row.SerialNumber))
  )
  const existingModels = new Set(
    modelResult.recordset.map((row) => normalizeKey(row.ModelName))
  )
  const newRecords = parsed.records.filter(
    (record) => !existingSerialNumbers.has(normalizeKey(record.serialNumber))
  )
  const modelsToAdd = getDistinctModels(parsed.records).filter(
    (model) => !existingModels.has(normalizeKey(model))
  ).length
  const recordOnly = isRecordOnlyDeviceImport(purpose)

  return {
    totalRows,
    validRecords: parsed.records.length,
    skippedRows: parsed.skippedBlankRows,
    identicalDuplicateRows: parsed.identicalDuplicateRows,
    conflictingDuplicateRows: parsed.conflicts.length,
    existingDevices: parsed.records.length - newRecords.length,
    existingDevicesPreserved: recordOnly ? parsed.records.length - newRecords.length : 0,
    newDevices: newRecords.length,
    newDevicesUsingDefaultStatus: recordOnly
      ? 0
      : newRecords.filter((record) => !record.status).length,
    newDevicesWithoutInventoryStatus: recordOnly ? newRecords.length : 0,
    modelsToAdd,
  }
}

async function rollbackTransaction(transaction: sql.Transaction): Promise<void> {
  try {
    await transaction.rollback()
  } catch (rollbackError: unknown) {
    console.error("[Excel Import] 回滚事务失败:", rollbackError)
  }
}

async function executeImport(
  records: readonly DeviceImportRecord[],
  purpose: DeviceImportPurpose,
  operator: { userId: string; username: string; realName: string },
  fileName: string,
  totalRows: number,
  parsed: DeviceImportParseResult
): Promise<ImportExecutionStats> {
  const pool = await getDbConnection()
  const recordOnly = isRecordOnlyDeviceImport(purpose)
  const defaultStatus = getNewDeviceStatusForImportPurpose(purpose)
  let transaction: sql.Transaction | null = new sql.Transaction(pool)

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    await new sql.Request(transaction).batch(`
      CREATE TABLE #DeviceImport (
        [ExcelRow] INT NOT NULL,
        [MaterialCode] NVARCHAR(100) NOT NULL,
        [SerialNumber] NVARCHAR(100) NOT NULL PRIMARY KEY,
        [DeviceName] NVARCHAR(200) NOT NULL,
        [ModelName] NVARCHAR(200) NOT NULL,
        [Location] NVARCHAR(200) NULL,
        [Status] NVARCHAR(50) NULL
      );
    `)

    const table = new sql.Table("#DeviceImport")
    table.create = false
    table.columns.add("ExcelRow", sql.Int, { nullable: false })
    table.columns.add("MaterialCode", sql.NVarChar(100), { nullable: false })
    table.columns.add("SerialNumber", sql.NVarChar(100), { nullable: false })
    table.columns.add("DeviceName", sql.NVarChar(200), { nullable: false })
    table.columns.add("ModelName", sql.NVarChar(200), { nullable: false })
    table.columns.add("Location", sql.NVarChar(200), { nullable: true })
    table.columns.add("Status", sql.NVarChar(50), { nullable: true })
    for (const record of records) {
      table.rows.add(
        record.excelRow,
        record.materialCode,
        record.serialNumber,
        record.deviceName,
        record.modelName,
        record.location,
        record.status
      )
    }
    await new sql.Request(transaction).bulk(table)

    const catalogResult = await new sql.Request(transaction).query<CatalogWriteResultRow>(`
      INSERT INTO [dbo].[Product_Catalog] (
        [Category], [SubCategory], [ModelName], [ModelCode], [Description],
        [Manufacturer], [DefaultWarrantyMonths], [IsActive], [CreatedAt], [UpdatedAt]
      )
      SELECT
        N'未分类', N'未分类', source.[ModelName],
        N'AUTO-' + REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N''),
        N'由设备库存 Excel 导入自动维护', N'爱克信', 12, 1,
        SYSUTCDATETIME(), SYSUTCDATETIME()
      FROM (
        SELECT MIN([ModelName]) AS [ModelName]
        FROM #DeviceImport
        GROUP BY UPPER(LTRIM(RTRIM([ModelName])))
      ) AS source
      WHERE NOT EXISTS (
        SELECT 1
        FROM [dbo].[Product_Catalog] AS target WITH (UPDLOCK, HOLDLOCK)
        WHERE UPPER(LTRIM(RTRIM(target.[ModelName]))) = UPPER(LTRIM(RTRIM(source.[ModelName])))
      );

      SELECT @@ROWCOUNT AS [ModelsAdded];
    `)
    const modelsAdded = catalogResult.recordset[0]?.ModelsAdded ?? 0

    const inventoryResult = await new sql.Request(transaction)
      .input("recordOnly", sql.Bit, recordOnly)
      .input("defaultStatus", sql.NVarChar(50), defaultStatus)
      .query<ImportWriteResultRow>(`
        DECLARE @DevicesUpdated INT;
        DECLARE @DevicesInserted INT;
        DECLARE @DevicesPreserved INT;

        SELECT @DevicesPreserved = CASE
          WHEN @recordOnly = 1 THEN COUNT(*)
          ELSE 0
        END
        FROM [dbo].[Device_Inventory] AS target WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN #DeviceImport AS source
          ON UPPER(LTRIM(RTRIM(target.[SerialNumber]))) = UPPER(LTRIM(RTRIM(source.[SerialNumber])));

        UPDATE target
        SET
          target.[MaterialCode] = source.[MaterialCode],
          target.[DeviceName] = source.[DeviceName],
          target.[ModelName] = source.[ModelName],
          target.[Location] = COALESCE(source.[Location], target.[Location]),
          target.[Status] = COALESCE(source.[Status], target.[Status]),
          target.[UpdatedAt] = SYSUTCDATETIME()
        FROM [dbo].[Device_Inventory] AS target WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN #DeviceImport AS source
          ON UPPER(LTRIM(RTRIM(target.[SerialNumber]))) = UPPER(LTRIM(RTRIM(source.[SerialNumber])))
        WHERE @recordOnly = 0;

        SET @DevicesUpdated = @@ROWCOUNT;

        INSERT INTO [dbo].[Device_Inventory] (
          [MaterialCode], [SerialNumber], [DeviceName], [ModelName],
          [Location], [Status], [CreatedAt], [UpdatedAt]
        )
        SELECT
          source.[MaterialCode], source.[SerialNumber], source.[DeviceName], source.[ModelName],
          CASE WHEN @recordOnly = 1 THEN NULL ELSE source.[Location] END,
          CASE WHEN @recordOnly = 1 THEN NULL ELSE COALESCE(source.[Status], @defaultStatus) END,
          SYSUTCDATETIME(), SYSUTCDATETIME()
        FROM #DeviceImport AS source
        WHERE NOT EXISTS (
          SELECT 1
          FROM [dbo].[Device_Inventory] AS target WITH (UPDLOCK, HOLDLOCK)
          WHERE UPPER(LTRIM(RTRIM(target.[SerialNumber]))) = UPPER(LTRIM(RTRIM(source.[SerialNumber])))
        );

        SET @DevicesInserted = @@ROWCOUNT;

        SELECT
          @DevicesUpdated AS [DevicesUpdated],
          @DevicesInserted AS [DevicesInserted],
          @DevicesPreserved AS [DevicesPreserved];
      `)
    const writeCounts = inventoryResult.recordset[0]
    if (
      !writeCounts
      || writeCounts.DevicesUpdated + writeCounts.DevicesInserted + writeCounts.DevicesPreserved
        !== records.length
    ) {
      throw new Error("导入写入数量校验失败")
    }

    const distinctModelCount = getDistinctModels(records).length
    const auditNote = JSON.stringify({
      fileName: fileName.slice(0, 180),
      purpose,
      defaultStatus,
      records: records.length,
      inserted: writeCounts.DevicesInserted,
      updated: writeCounts.DevicesUpdated,
      preserved: writeCounts.DevicesPreserved,
      modelsAdded,
    })
    await new sql.Request(transaction)
      .input("actionBy", sql.NVarChar(100), operator.realName || operator.username)
      .input("actionNote", sql.NVarChar(sql.MAX), auditNote)
      .input("operatorId", sql.Int, Number(operator.userId))
      .input("operatorName", sql.NVarChar(100), operator.realName || operator.username)
      .input(
        "description",
        sql.NVarChar(sql.MAX),
        `导入设备库存：新增 ${writeCounts.DevicesInserted} 台，更新 ${writeCounts.DevicesUpdated} 台`
      )
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [TicketID], [ActionType], [ActionBy], [ActionNote],
          [CreatedAt], [OperatorId], [OperatorName], [Description]
        )
        VALUES (
          NULL, N'device_inventory_import', @actionBy, @actionNote,
          SYSUTCDATETIME(), @operatorId, @operatorName, @description
        );
      `)

    await transaction.commit()
    transaction = null

    return {
      totalRows,
      validRecords: records.length,
      skippedRows: parsed.skippedBlankRows,
      identicalDuplicateRows: parsed.identicalDuplicateRows,
      conflictingDuplicateRows: parsed.conflicts.length,
      modelsAdded,
      modelsSkipped: distinctModelCount - modelsAdded,
      devicesInserted: writeCounts.DevicesInserted,
      devicesUpdated: writeCounts.DevicesUpdated,
      devicesPreserved: writeCounts.DevicesPreserved,
      devicesProcessed:
        writeCounts.DevicesInserted + writeCounts.DevicesUpdated + writeCounts.DevicesPreserved,
    }
  } catch (error: unknown) {
    if (transaction) {
      await rollbackTransaction(transaction)
      transaction = null
    }
    throw error
  } finally {
    transaction = null
  }
}

// POST /api/import/excel-stream
export async function POST(request: Request) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const formData = await request.formData()
        const fileEntry = formData.get("file")
        if (!(fileEntry instanceof File)) {
          sendEvent(encoder, controller, false, "未找到上传的 Excel 文件", { stage: "error" })
          controller.close()
          return
        }

        const requestOptions = importRequestSchema.safeParse({
          mode: formData.get("mode") || undefined,
          purpose: formData.get("purpose") || undefined,
          defaultStatus: formData.get("defaultStatus") || undefined,
        })
        if (!requestOptions.success) {
          sendEvent(encoder, controller, false, "导入参数无效", { stage: "error" })
          controller.close()
          return
        }
        const purpose = requestOptions.data.purpose
          ?? getImportPurposeFromLegacyDefaultStatus(requestOptions.data.defaultStatus)
          ?? DEFAULT_DEVICE_IMPORT_PURPOSE

        sendEvent(encoder, controller, true, "正在解析 Excel 文件", {
          stage: "parsing",
          progress: 0,
          total: 100,
          percentage: 0,
        })
        const bytes = new Uint8Array(await fileEntry.arrayBuffer())
        validateDeviceImportFile(fileEntry.name, fileEntry.type, bytes)
        const workbook = XLSX.read(bytes, { type: "array", cellDates: true })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          throw new Error("Excel 文件中没有工作表")
        }
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
          defval: "",
          raw: false,
          header: 1,
        })
        const totalRows = Math.max(0, rows.length - 1)

        sendEvent(encoder, controller, true, `已解析 ${totalRows.toLocaleString()} 行数据`, {
          stage: "validating",
          progress: 50,
          total: 100,
          percentage: 50,
        })
        const parsed = parseDeviceImportRows(rows)
        if (parsed.conflicts.length > 0 && !isRecordOnlyDeviceImport(purpose)) {
          sendEvent(
            encoder,
            controller,
            false,
            `发现 ${parsed.conflicts.length} 个序列号存在资料冲突，请先处理冲突后再导入`,
            { stage: "error", conflicts: parsed.conflicts.slice(0, 20) }
          )
          controller.close()
          return
        }

        if (requestOptions.data.mode === "preview") {
          const preview = await buildPreview(parsed, totalRows, purpose)
          sendEvent(encoder, controller, true, "预检完成，尚未写入数据库", {
            stage: "preview",
            progress: 100,
            total: 100,
            percentage: 100,
            preview,
          })
          controller.close()
          return
        }

        sendEvent(encoder, controller, true, "预检通过，正在执行原子导入", {
          stage: "importing",
          progress: 70,
          total: 100,
          percentage: 70,
        })
        const stats = await executeImport(
          parsed.records,
          purpose,
          authResult,
          fileEntry.name,
          totalRows,
          parsed
        )
        sendEvent(encoder, controller, true, "Excel 导入成功", {
          stage: "complete",
          progress: 100,
          total: 100,
          percentage: 100,
          stats,
        })
        controller.close()
      } catch (error: unknown) {
        console.error("[Excel Import] 导入失败:", error)
        sendEvent(encoder, controller, false, getDeviceImportErrorMessage(error), { stage: "error" })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
