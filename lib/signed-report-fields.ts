import { isSignedRepairReport } from "./repair-report-policy"

// Data used to render the confirmed report. Operational invoicing and logistics
// remain editable under the company's cross-role policy.
const REPORT_COLUMNS = new Set([
  "ProjectName", "ProjectLocation", "ClientName", "ContactInfo", "SenderAddress",
  "ModelName", "DeviceName", "DeviceSN", "Quantity", "Problem", "Category",
  "MaterialCode", "FullSpec", "FaultPoint", "RepairCost", "IsChargeable",
  "RepairAction", "RepairNotes", "FaultCategory", "RepairReportContent", "WarrantyStatusOverride",
])

function comparable(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "boolean") return value ? "1" : "0"
  return String(value).trim()
}

export function changesSignedReport(
  current: Record<string, unknown>,
  updates: Record<string, unknown>
): boolean {
  if (!isSignedRepairReport(current)) return false
  return Object.entries(updates).some(([key, value]) =>
    REPORT_COLUMNS.has(key) && comparable(value) !== comparable(current[key]))
}
