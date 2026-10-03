import { FinalOutcome } from "./enums"
import { parseRepairReportContent } from "./repair-report-policy"

export interface ShippingPlanRow {
  Id: number
  Quantity: number | null
  RepairReportContent: string | null
  ShippingType?: string | null
}
export interface ShippingAllocation { deviceId: number; stockQuantity: number }
export interface PlannedShippingDevice extends ShippingAllocation { returnQuantity: number; quantity: number; stockQuantityLocked: boolean }

function requiredStockQuantity(content: Record<string, unknown>, quantity: number): number | null {
  if (content.finalOutcome === FinalOutcome.RETURN_UNREPAIRED && content.willReturn === false) {
    throw new Error("最终退回结果与不回寄确认矛盾，请先纠正最终处理结果")
  }
  if (content.finalOutcome === FinalOutcome.SCRAPPED || content.willReturn === false) return quantity
  if (content.finalOutcome === FinalOutcome.RETURN_UNREPAIRED) return 0
  return null
}

export function getSavedShippingAllocation(row: ShippingPlanRow): PlannedShippingDevice {
  const quantity = Number(row.Quantity ?? 1)
  const content = parseRepairReportContent(row.RepairReportContent)
  const requiredStock = requiredStockQuantity(content, quantity)
  const saved = content.shippingAllocation
  const stockQuantity = saved && typeof saved === "object" && "stockQuantity" in saved
    ? Number(saved.stockQuantity) : requiredStock ?? (row.ShippingType === "stock" ? quantity : 0)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > quantity) {
    throw new Error("设备入库数量无效，请重新保存发货分配")
  }
  if (requiredStock !== null && stockQuantity !== requiredStock) {
    throw new Error("发货分配与已确认的最终去向矛盾，请先纠正处理结果或发货分配")
  }
  return { deviceId: row.Id, quantity, stockQuantity, returnQuantity: quantity - stockQuantity, stockQuantityLocked: requiredStock !== null }
}

export function buildShippingPlan(rows: readonly ShippingPlanRow[], allocations?: readonly ShippingAllocation[], allStock = false): PlannedShippingDevice[] {
  if (rows.length === 0) throw new Error("批次不存在")
  if (rows.some(row => !Object.values(FinalOutcome).includes(parseRepairReportContent(row.RepairReportContent).finalOutcome as FinalOutcome))) {
    throw new Error("所有设备必须先保存最终处理结果，才能统一发货或入库")
  }
  const requested = allocations ? new Map(allocations.map(item => [item.deviceId, item.stockQuantity])) : null
  if (requested && (requested.size !== allocations!.length || requested.size !== rows.length || rows.some(row => !requested.has(row.Id)))) {
    throw new Error("设备清单已变化，请刷新后重新分配")
  }
  return rows.map(row => {
    const content = parseRepairReportContent(row.RepairReportContent)
    const stockQuantity = requested ? requested.get(row.Id) : allStock ? Number(row.Quantity ?? 1) : getSavedShippingAllocation(row).stockQuantity
    return getSavedShippingAllocation({ ...row,
      RepairReportContent: JSON.stringify({ ...content, shippingAllocation: { stockQuantity } }),
    })
  })
}

export function summarizeShippingPlan(plan: readonly PlannedShippingDevice[]) {
  const returnQuantity = plan.reduce((sum, row) => sum + row.returnQuantity, 0)
  const stockQuantity = plan.reduce((sum, row) => sum + row.stockQuantity, 0)
  return { returnQuantity, stockQuantity, deviceCount: returnQuantity + stockQuantity, shippingType: returnQuantity > 0 ? "return" as const : "stock" as const }
}
