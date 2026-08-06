import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface WorkOrderCardColumnsProps {
  workOrder: ReactNode
  customer: ReactNode
  project: ReactNode
  model: ReactNode
  serial: ReactNode
  status: ReactNode
  meta: ReactNode
  compact?: boolean
  className?: string
}

export function WorkOrderCardColumns({
  workOrder,
  customer,
  project,
  model,
  serial,
  status,
  meta,
  compact = false,
  className,
}: WorkOrderCardColumnsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:items-center",
        compact
          ? "xl:[grid-template-columns:minmax(0,1.1fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,.9fr)_minmax(0,1.15fr)]"
          : "xl:[grid-template-columns:minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,.9fr)_minmax(0,1.2fr)]",
        className,
      )}
    >
      <div className="min-w-0">{workOrder}</div>
      <div className="min-w-0">{customer}</div>
      <div className="min-w-0">{project}</div>
      <div className="min-w-0">{model}</div>
      <div className="min-w-0">{serial}</div>
      <div className="min-w-0">{status}</div>
      <div className="min-w-0">{meta}</div>
    </div>
  )
}
