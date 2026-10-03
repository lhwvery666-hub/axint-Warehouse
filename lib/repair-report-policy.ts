/** A saved signature or completed signature confirmation makes the approved report immutable. */
export function isSignedRepairReport(row: {
  SignedReportPhoto?: unknown
  ReporterConfirmedAt?: unknown
  signedReportPhoto?: unknown
  reporterConfirmedAt?: unknown
}): boolean {
  const photo = row.SignedReportPhoto ?? row.signedReportPhoto
  return (typeof photo === "string" && photo.trim().length > 0) ||
    Boolean(row.ReporterConfirmedAt ?? row.reporterConfirmedAt)
}

export function parseRepairReportContent(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {}
  } catch { return {} }
}

export function mergeRepairReportContent(raw: string | null | undefined, patch: Record<string, unknown>): string {
  return JSON.stringify({ ...parseRepairReportContent(raw), ...patch })
}

/** RepairCost is already each device row's amount; Quantity never multiplies it. */
export function sumRepairCosts(rows: ReadonlyArray<{ RepairCost: number | string | null }>): number {
  return rows.reduce((cents, row) => cents + Math.round(Number(row.RepairCost || 0) * 100), 0) / 100
}
