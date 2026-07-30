import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface WorkOrderCardColumnsProps {
  workOrder: ReactNode
  customer: ReactNode
  device: ReactNode
  status: ReactNode
  meta?: ReactNode
  compact?: boolean
  className?: string
}

export function WorkOrderCardColumns({
  workOrder,
  customer,
  device,
  status,
  meta,
  compact = false,
  className,
}: WorkOrderCardColumnsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:items-center",
        compact ? "lg:grid-cols-2 xl:grid-cols-2" : meta ? "xl:grid-cols-5" : "xl:grid-cols-4",
        className,
      )}
    >
      <div className="min-w-0">{workOrder}</div>
      <div className="min-w-0">{customer}</div>
      <div className="min-w-0">{device}</div>
      <div className="min-w-0">{status}</div>
      {meta && <div className="min-w-0">{meta}</div>}
    </div>
  )
}
