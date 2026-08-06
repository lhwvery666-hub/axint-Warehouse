"use client"

import type { ReactNode } from "react"
import { AlertCircle, Package, ShieldAlert, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { WorkOrderCardColumns } from "@/components/work-order-card-columns"
import { cn } from "@/lib/utils"

export interface WorkOrderListRowProps {
  title: string
  isBatch: boolean
  projectName?: string
  customerName?: string
  reportedBy?: string
  reportedByUsername?: string
  contactInfo?: string
  contactPhone?: string
  deviceCount?: number
  deviceSerials?: string[]
  deviceSerialNumber?: string
  deviceModel?: string
  deviceModels?: string[]
  faultText?: string
  inWarranty?: boolean
  unreadCount?: number
  hasSignedPhoto?: boolean
  priorityIndicator?: ReactNode
  statusNode?: ReactNode
  reportedAt?: string
  delayedText?: string
  pendingSnText?: string
  actions?: ReactNode
  belowContent?: ReactNode
  compact?: boolean
  onClick?: () => void
  className?: string
}

function summarizeValues(values: string[] | undefined, fallback: string): string {
  const normalizedValues = Array.from(
    new Set((values ?? []).map((value) => value?.trim()).filter(Boolean)),
  )

  if (normalizedValues.length === 0) return fallback
  if (normalizedValues.length <= 2) return normalizedValues.join("、")
  return `${normalizedValues.slice(0, 2).join("、")} 等${normalizedValues.length}项`
}

export function WorkOrderListRow({
  title,
  isBatch,
  projectName,
  customerName,
  reportedBy,
  reportedByUsername,
  contactInfo,
  contactPhone,
  deviceCount,
  deviceSerials,
  deviceSerialNumber,
  deviceModel,
  deviceModels,
  faultText,
  inWarranty,
  unreadCount = 0,
  hasSignedPhoto,
  priorityIndicator,
  statusNode,
  reportedAt,
  delayedText,
  pendingSnText,
  actions,
  belowContent,
  compact = false,
  onClick,
  className,
}: WorkOrderListRowProps) {
  const serialSummary = summarizeValues(deviceSerials, deviceSerialNumber || "未填写")
  const modelSummary = summarizeValues(deviceModels, deviceModel || "未填写")

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col border-b border-border/50 transition-colors last:border-b-0",
        "hover:bg-muted/40 dark:hover:bg-muted/20",
        className,
      )}
    >
      <WorkOrderCardColumns
        className="px-3 py-3"
        compact={compact}
        workOrder={(
          <div className="flex flex-wrap items-center gap-1.5">
            {priorityIndicator && <div className="shrink-0">{priorityIndicator}</div>}
            <span className="truncate text-sm font-semibold text-foreground">{title}</span>
            {isBatch && deviceCount !== undefined && (
              <Badge variant="secondary" className="h-5 px-1.5 py-0 text-[11px]">
                {deviceCount}台
              </Badge>
            )}
          </div>
        )}
        customer={(
          <div className="space-y-1 text-xs">
            <p className="truncate">
              <span className="text-muted-foreground">客户：</span>
              {customerName || "未填写客户"}
            </p>
            <p className="truncate text-muted-foreground">
              用户：{reportedBy || reportedByUsername || contactInfo || "未填写用户"}
              {contactPhone && <span className="ml-1">({contactPhone})</span>}
            </p>
          </div>
        )}
        project={(
          <p className="truncate text-xs">
            <span className="text-muted-foreground">项目：</span>
            {projectName || "未填写项目"}
          </p>
        )}
        model={(
          <div className="space-y-1 text-xs">
            <p className="truncate">
              <span className="text-muted-foreground">型号：</span>
              {modelSummary}
            </p>
            {faultText && (
              <p className="flex min-w-0 items-center gap-1 text-muted-foreground">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span className="truncate">{faultText}</span>
              </p>
            )}
          </div>
        )}
        serial={(
          <div className="space-y-1 text-xs">
            <p className="flex min-w-0 items-center gap-1">
              <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">SN：{serialSummary}</span>
            </p>
          </div>
        )}
        status={(
          <div className="flex flex-wrap items-center gap-1.5">
            {statusNode}
            {inWarranty !== undefined && (
              inWarranty ? (
                <Badge variant="outline" className="h-5 border-green-200 bg-green-50 px-1.5 py-0 text-[11px] text-green-700">
                  <ShieldCheck className="mr-0.5 h-3 w-3" />保修内
                </Badge>
              ) : (
                <Badge variant="outline" className="h-5 border-red-200 bg-red-50 px-1.5 py-0 text-[11px] text-red-700">
                  <ShieldAlert className="mr-0.5 h-3 w-3" />过保修
                </Badge>
              )
            )}
            {isBatch && unreadCount > 0 && (
              <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            {isBatch && hasSignedPhoto && (
              <span title="已上传签字凭证" className="text-green-600">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        )}
        meta={(
          <div className="flex items-center justify-between gap-2 xl:justify-end">
            <div className="space-y-0.5 text-right">
              {reportedAt && <p className="whitespace-nowrap text-[11px] text-muted-foreground">{reportedAt}</p>}
              {delayedText && <p className="whitespace-nowrap text-[11px] text-amber-500">{delayedText}</p>}
              {pendingSnText && <p className="whitespace-nowrap text-[11px] text-warning">{pendingSnText}</p>}
            </div>
            {actions && (
              <div className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                {actions}
              </div>
            )}
          </div>
        )}
      />
      {belowContent && <div className="-mt-1 px-3 pb-2">{belowContent}</div>}
    </div>
  )
}
