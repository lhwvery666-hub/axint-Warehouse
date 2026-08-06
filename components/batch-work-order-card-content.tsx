import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { CardContent } from "@/components/ui/card"
import { WorkOrderCardColumns } from "@/components/work-order-card-columns"

interface BatchWorkOrderCardContentProps {
  batchId: string
  deviceCount: number
  customerName?: string | null
  projectName?: string | null
  projectLocation?: string | null
  reportedBy?: string | null
  reportedByUsername?: string | null
  deviceSerials?: string | null
  deviceModels?: string | null
  category?: string | null
  statusNode: ReactNode
  statusDetails?: ReactNode
  createdAt: ReactNode
  trailing?: ReactNode
}

function summarizeAggregatedValues(value: string | null | undefined, fallback: string): string {
  const values = (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
  const uniqueValues = Array.from(new Set(values))

  if (uniqueValues.length === 0) return fallback
  if (uniqueValues.length <= 2) return uniqueValues.join("、")
  return `${uniqueValues.slice(0, 2).join("、")} 等${uniqueValues.length}项`
}

export function BatchWorkOrderCardContent({
  batchId,
  deviceCount,
  customerName,
  projectName,
  projectLocation,
  reportedBy,
  reportedByUsername,
  deviceSerials,
  deviceModels,
  category,
  statusNode,
  statusDetails,
  createdAt,
  trailing,
}: BatchWorkOrderCardContentProps) {
  const customer = customerName || projectName || "未填写客户"
  const project = projectLocation || (projectName !== customer ? projectName : "") || "未填写项目"
  const reporter = reportedBy || reportedByUsername || "未填写用户"
  const serialSummary = summarizeAggregatedValues(deviceSerials, "未填写 SN")
  const modelSummary = summarizeAggregatedValues(deviceModels, category || "未填写型号")

  return (
    <CardContent className="p-4">
      <WorkOrderCardColumns
        workOrder={(
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{batchId}</h3>
            <Badge variant="secondary">{deviceCount} 台设备</Badge>
          </div>
        )}
        customer={(
          <div className="space-y-1 text-sm">
            <p className="truncate"><span className="text-muted-foreground">客户：</span>{customer}</p>
            <p className="truncate text-muted-foreground">用户：{reporter}</p>
          </div>
        )}
        project={(
          <p className="truncate text-sm"><span className="text-muted-foreground">项目：</span>{project}</p>
        )}
        model={(
          <div className="space-y-1 text-sm">
            <p className="truncate"><span className="text-muted-foreground">型号：</span>{modelSummary}</p>
          </div>
        )}
        serial={(
          <p className="truncate text-sm"><span className="text-muted-foreground">SN：</span>{serialSummary}</p>
        )}
        status={(
          <div className="space-y-1">
            <div>{statusNode}</div>
            {statusDetails && <div className="text-xs text-muted-foreground">{statusDetails}</div>}
          </div>
        )}
        meta={(
          <div className="flex items-center justify-between gap-3 xl:justify-end">
            <div className="whitespace-nowrap text-xs text-muted-foreground">{createdAt}</div>
            {trailing}
          </div>
        )}
      />
    </CardContent>
  )
}
