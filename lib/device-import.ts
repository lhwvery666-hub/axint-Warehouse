import { SPECIAL_VALUES } from "@/lib/enums"

export const MAX_DEVICE_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_DEVICE_IMPORT_ROWS = 100_000

export const DEVICE_IMPORT_MODES = ["preview", "execute"] as const
export type DeviceImportMode = (typeof DEVICE_IMPORT_MODES)[number]

export const NEW_DEVICE_DEFAULT_STATUSES = [
  SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK,
  SPECIAL_VALUES.DEVICE_STATUS_OUT_STOCK,
] as const
export type NewDeviceDefaultStatus = (typeof NEW_DEVICE_DEFAULT_STATUSES)[number]

export const DEVICE_IMPORT_PURPOSES = [
  "record_only",
  "in_stock",
  "out_stock",
] as const
export type DeviceImportPurpose = (typeof DEVICE_IMPORT_PURPOSES)[number]

export const DEFAULT_DEVICE_IMPORT_PURPOSE: DeviceImportPurpose = "record_only"

export const DEVICE_IMPORT_PURPOSE_LABELS: Record<DeviceImportPurpose, string> = {
  record_only: "仅建档（不设置库存状态）",
  in_stock: "新增设备：在库",
  out_stock: "新增设备：出库",
}

export function getNewDeviceStatusForImportPurpose(
  purpose: DeviceImportPurpose
): NewDeviceDefaultStatus | null {
  if (purpose === "in_stock") return SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK
  if (purpose === "out_stock") return SPECIAL_VALUES.DEVICE_STATUS_OUT_STOCK
  return null
}

export function getImportPurposeFromLegacyDefaultStatus(
  status: NewDeviceDefaultStatus | undefined
): DeviceImportPurpose {
  if (status === SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK) return "in_stock"
  if (status === SPECIAL_VALUES.DEVICE_STATUS_OUT_STOCK) return "out_stock"
  return DEFAULT_DEVICE_IMPORT_PURPOSE
}

export function isRecordOnlyDeviceImport(purpose: DeviceImportPurpose): boolean {
  return purpose === DEFAULT_DEVICE_IMPORT_PURPOSE
}

const ALLOWED_DEVICE_STATUSES = new Set<string>([
  SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK,
  SPECIAL_VALUES.DEVICE_STATUS_OUT_STOCK,
  SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK_EN,
  SPECIAL_VALUES.DEVICE_STATUS_OUT_STOCK_EN,
  SPECIAL_VALUES.DEVICE_STATUS_REPAIRING,
  "In_Stock",
  "Out_Stock",
])

const HEADER_ALIASES = {
  materialCode: ["物料代码", "物料编码", "materialcode"],
  serialNumber: ["序列号", "产品序列号", "设备序列号", "serialnumber", "sn"],
  deviceName: ["物料名称", "设备名称", "devicename"],
  modelName: ["规格型号", "型号", "modelname"],
  location: ["库位", "仓库位置", "存放位置", "location"],
  status: ["状态", "设备状态", "status"],
} as const

const FIELD_MAX_LENGTHS = {
  materialCode: 100,
  serialNumber: 100,
  deviceName: 200,
  modelName: 200,
  location: 200,
  status: 50,
} as const

type HeaderKey = keyof typeof HEADER_ALIASES

export interface DeviceImportRecord {
  excelRow: number
  materialCode: string
  serialNumber: string
  deviceName: string
  modelName: string
  location: string | null
  status: string | null
}

export interface DeviceImportConflict {
  serialNumber: string
  firstExcelRow: number
  conflictingExcelRow: number
  differingFields: readonly string[]
}

export interface DeviceImportParseResult {
  records: DeviceImportRecord[]
  skippedBlankRows: number
  identicalDuplicateRows: number
  conflicts: DeviceImportConflict[]
  hasLocationColumn: boolean
  hasStatusColumn: boolean
}

export class DeviceImportValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues[0] ?? "Excel 数据校验失败")
    this.name = "DeviceImportValidationError"
    this.issues = issues
  }
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toLocaleLowerCase("zh-CN")
}

function normalizeCell(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const normalized = String(value).normalize("NFKC").trim()
  return normalized === "" ? null : normalized
}

function findHeaderIndex(headerRow: readonly unknown[], key: HeaderKey): number {
  const aliases = new Set(HEADER_ALIASES[key].map(normalizeHeader))
  return headerRow.findIndex((header) => aliases.has(normalizeHeader(header)))
}

function compareRecords(
  first: DeviceImportRecord,
  second: DeviceImportRecord
): readonly string[] {
  const fields: ReadonlyArray<keyof Omit<DeviceImportRecord, "excelRow">> = [
    "materialCode",
    "serialNumber",
    "deviceName",
    "modelName",
    "location",
    "status",
  ]

  return fields.filter((field) => first[field] !== second[field])
}

function validateFieldLengths(record: DeviceImportRecord): string[] {
  const issues: string[] = []
  for (const [field, maxLength] of Object.entries(FIELD_MAX_LENGTHS)) {
    const value = record[field as keyof DeviceImportRecord]
    if (typeof value === "string" && value.length > maxLength) {
      issues.push(`第 ${record.excelRow} 行“${field}”超过 ${maxLength} 个字符`)
    }
  }
  return issues
}

export function parseDeviceImportRows(
  rows: readonly (readonly unknown[])[]
): DeviceImportParseResult {
  if (rows.length === 0) {
    throw new DeviceImportValidationError(["Excel 文件中没有数据"])
  }
  if (rows.length - 1 > MAX_DEVICE_IMPORT_ROWS) {
    throw new DeviceImportValidationError([
      `Excel 数据超过 ${MAX_DEVICE_IMPORT_ROWS.toLocaleString()} 行上限`,
    ])
  }

  const headerRow = rows[0]
  const headerIndexes: Record<HeaderKey, number> = {
    materialCode: findHeaderIndex(headerRow, "materialCode"),
    serialNumber: findHeaderIndex(headerRow, "serialNumber"),
    deviceName: findHeaderIndex(headerRow, "deviceName"),
    modelName: findHeaderIndex(headerRow, "modelName"),
    location: findHeaderIndex(headerRow, "location"),
    status: findHeaderIndex(headerRow, "status"),
  }

  const requiredHeaders: ReadonlyArray<[HeaderKey, string]> = [
    ["materialCode", "物料代码"],
    ["serialNumber", "序列号"],
    ["deviceName", "物料名称"],
    ["modelName", "规格型号"],
  ]
  const missingHeaders = requiredHeaders
    .filter(([key]) => headerIndexes[key] < 0)
    .map(([, label]) => label)

  if (missingHeaders.length > 0) {
    throw new DeviceImportValidationError([
      `缺少必需表头：${missingHeaders.join("、")}`,
    ])
  }

  const records: DeviceImportRecord[] = []
  const conflicts: DeviceImportConflict[] = []
  const issues: string[] = []
  const seen = new Map<string, DeviceImportRecord>()
  let skippedBlankRows = 0
  let identicalDuplicateRows = 0

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    const excelRow = index + 1
    const rowHasContent = row.some((cell) => normalizeCell(cell) !== null)
    if (!rowHasContent) {
      skippedBlankRows += 1
      continue
    }

    const materialCode = normalizeCell(row[headerIndexes.materialCode])
    const serialNumber = normalizeCell(row[headerIndexes.serialNumber])
    const deviceName = normalizeCell(row[headerIndexes.deviceName])
    const modelName = normalizeCell(row[headerIndexes.modelName])
    const location = headerIndexes.location >= 0
      ? normalizeCell(row[headerIndexes.location])
      : null
    const status = headerIndexes.status >= 0
      ? normalizeCell(row[headerIndexes.status])
      : null

    const missingFields = [
      [materialCode, "物料代码"],
      [serialNumber, "序列号"],
      [deviceName, "物料名称"],
      [modelName, "规格型号"],
    ]
      .filter(([value]) => !value)
      .map(([, label]) => label)

    if (missingFields.length > 0) {
      issues.push(`第 ${excelRow} 行缺少：${missingFields.join("、")}`)
      continue
    }

    if (status && !ALLOWED_DEVICE_STATUSES.has(status)) {
      issues.push(`第 ${excelRow} 行设备状态“${status}”不受支持`)
      continue
    }

    const record: DeviceImportRecord = {
      excelRow,
      materialCode: materialCode as string,
      serialNumber: serialNumber as string,
      deviceName: deviceName as string,
      modelName: modelName as string,
      location,
      status,
    }

    issues.push(...validateFieldLengths(record))

    const serialKey = record.serialNumber.toLocaleUpperCase("en-US")
    const previous = seen.get(serialKey)
    if (previous) {
      const differingFields = compareRecords(previous, record)
      if (differingFields.length === 0) {
        identicalDuplicateRows += 1
      } else {
        conflicts.push({
          serialNumber: record.serialNumber,
          firstExcelRow: previous.excelRow,
          conflictingExcelRow: record.excelRow,
          differingFields,
        })
      }
      continue
    }

    seen.set(serialKey, record)
    records.push(record)
  }

  if (issues.length > 0) {
    throw new DeviceImportValidationError(issues.slice(0, 50))
  }
  if (records.length === 0) {
    throw new DeviceImportValidationError(["Excel 文件中没有可导入的有效设备记录"])
  }

  return {
    records,
    skippedBlankRows,
    identicalDuplicateRows,
    conflicts,
    hasLocationColumn: headerIndexes.location >= 0,
    hasStatusColumn: headerIndexes.status >= 0,
  }
}

export function validateDeviceImportFile(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array
): void {
  if (bytes.byteLength === 0) {
    throw new DeviceImportValidationError(["上传文件为空"])
  }
  if (bytes.byteLength > MAX_DEVICE_IMPORT_FILE_SIZE_BYTES) {
    throw new DeviceImportValidationError(["Excel 文件不能超过 10MB"])
  }

  const normalizedName = fileName.trim().toLocaleLowerCase("en-US")
  const extension = normalizedName.endsWith(".xlsx")
    ? ".xlsx"
    : normalizedName.endsWith(".xls")
      ? ".xls"
      : null

  if (!extension) {
    throw new DeviceImportValidationError(["只支持 .xlsx 或 .xls 格式的 Excel 文件"])
  }

  const allowedMimeTypes = new Set([
    "",
    "application/octet-stream",
    "application/excel",
    "application/x-excel",
    "application/x-msexcel",
    "application/xls",
    "application/vnd.ms-excel",
    "application/vnd.ms-office",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ])
  if (!allowedMimeTypes.has(mimeType.toLocaleLowerCase("en-US"))) {
    throw new DeviceImportValidationError(["文件 MIME 类型与 Excel 格式不匹配"])
  }

  const hasOleSignature = bytes.length >= 8
    && bytes[0] === 0xd0
    && bytes[1] === 0xcf
    && bytes[2] === 0x11
    && bytes[3] === 0xe0
    && bytes[4] === 0xa1
    && bytes[5] === 0xb1
    && bytes[6] === 0x1a
    && bytes[7] === 0xe1
  const hasZipSignature = bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(bytes[2])
    && [0x04, 0x06, 0x08].includes(bytes[3])

  if ((extension === ".xls" && !hasOleSignature) || (extension === ".xlsx" && !hasZipSignature)) {
    throw new DeviceImportValidationError(["文件内容与 Excel 扩展名不匹配或文件已损坏"])
  }
}

export function getDeviceImportErrorMessage(error: unknown): string {
  if (error instanceof DeviceImportValidationError) {
    const visibleIssues = error.issues.slice(0, 5)
    const remaining = error.issues.length - visibleIssues.length
    return `${visibleIssues.join("；")}${remaining > 0 ? `；另有 ${remaining} 项问题` : ""}`
  }
  return "导入失败，请检查文件格式或联系管理员"
}
