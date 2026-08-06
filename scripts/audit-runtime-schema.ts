import { closeDbConnection, getDbConnection } from "@/lib/db-config"

const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  Batch_Number_Sequence: ["DateKey", "CurrentValue", "UpdatedAt"],
  Batch_Stamp_Attachments: [
    "Id",
    "BatchId",
    "FileName",
    "OriginalName",
    "FilePath",
    "MimeType",
    "FileSize",
    "UploadedById",
    "UploadedByName",
    "UploadedByRole",
    "CreatedAt",
  ],
  Repair_Tickets: [
    "FactoryTrackingNum",
    "FactoryShipDate",
    "ArrivalDate",
    "ReportTime",
    "Category",
    "SubCategory",
    "ModelName",
    "DeviceName",
  ],
  Repair_Ticket_History: [
    "HistoryID",
    "TicketID",
    "ActionType",
    "OldStatus",
    "NewStatus",
    "ActionBy",
    "ActionNote",
    "DelayTo",
    "DelayReason",
    "CreatedAt",
    "BatchId",
    "OperatorId",
    "OperatorName",
    "Description",
  ],
  Device_Inventory: [
    "SerialNumber",
    "MaterialCode",
    "DeviceName",
    "ModelName",
    "Location",
    "Status",
    "CreatedAt",
    "UpdatedAt",
  ],
  Product_Catalog: [
    "Category",
    "SubCategory",
    "ModelName",
    "ModelCode",
    "Description",
    "Manufacturer",
    "DefaultWarrantyMonths",
    "IsActive",
    "CreatedAt",
    "UpdatedAt",
  ],
}

interface ColumnRow {
  TABLE_NAME: string
  COLUMN_NAME: string
}

async function main(): Promise<void> {
  const pool = await getDbConnection()

  try {
    const result = await pool.request().query<ColumnRow>(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME IN (
          'Batch_Number_Sequence',
          'Batch_Stamp_Attachments',
          'Repair_Tickets',
          'Repair_Ticket_History',
          'Device_Inventory',
          'Product_Catalog'
        )
    `)
    const availableColumns = new Map<string, Set<string>>()

    for (const row of result.recordset) {
      const columns = availableColumns.get(row.TABLE_NAME) ?? new Set<string>()
      columns.add(row.COLUMN_NAME)
      availableColumns.set(row.TABLE_NAME, columns)
    }

    const missing: string[] = []
    for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
      const columns = availableColumns.get(tableName)
      if (!columns) {
        missing.push(`${tableName} (table missing)`)
        continue
      }

      for (const columnName of requiredColumns) {
        if (!columns.has(columnName)) {
          missing.push(`${tableName}.${columnName}`)
        }
      }
    }

    if (missing.length > 0) {
      console.error("Runtime schema audit failed. Missing objects:")
      for (const item of missing) {
        console.error(`- ${item}`)
      }
      process.exitCode = 1
      return
    }

    const requiredColumnCount = Object.values(REQUIRED_COLUMNS)
      .reduce((total, columns) => total + columns.length, 0)
    console.log(
      `Runtime schema audit passed (${Object.keys(REQUIRED_COLUMNS).length} tables, ${requiredColumnCount} required columns).`
    )
  } finally {
    await closeDbConnection()
  }
}

void main().catch((error: unknown) => {
  console.error("Runtime schema audit failed to run:", error)
  process.exitCode = 1
})
