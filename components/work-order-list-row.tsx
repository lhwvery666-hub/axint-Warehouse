"use client"

import { ReactNode } from "react"
import { AlertCircle, Package, ShieldCheck, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * 紧凑列表行组件 —— 替代原来的卡片（Card）布局
 * 用于 dashboard.tsx / app/report/page.tsx / repair-page.tsx 共享渲染工单列表项
 *
 * 设计目标：单行高度控制在 ~60-72px，单屏尽量展示更多工单，
 * 移动端自动降级隐藏次要信息（项目/联系人保留，其余靠右侧列收起）
 */
export interface WorkOrderListRowProps {
  /** 标题：如 "工单号：WO-xxx" 或 "序列号：SNxxx" */
  title: string
  /** 是否为批次工单（决定展示项目/设备数量 还是 单台故障描述） */
  isBatch: boolean
  /** 项目名称 */
  projectName?: string
  /** 联系人 */
  contactInfo?: string
  contactPhone?: string
  /** 批次设备数量 */
  deviceCount?: number
  /** 批次内设备序列号（用于展示前几个小徽标） */
  deviceSerials?: string[]
  /** 非批次单台工单的故障描述 */
  faultText?: string
  /** 保修状态：undefined 表示不展示 */
  inWarranty?: boolean
  /** 未读消息数（仅批次工单），0/undefined 不展示红点 */
  unreadCount?: number
  /** 是否已上传签字凭证（仅批次工单） */
  hasSignedPhoto?: boolean
  /** 右上角优先级指示器（原卡片左上角的圆点） */
  priorityIndicator?: ReactNode
  /** 右侧状态徽标（各页面 getStatusBadge 结果） */
  statusNode?: ReactNode
  /** 上报时间文本 */
  reportedAt?: string
  /** 延期提示文本，如 "延期至 2026-01-01" */
  delayedText?: string
  /** 待补录 SN 提示 */
  pendingSnText?: string
  /** 行内右侧的操作按钮区（紧凑按钮，不再是卡片底部整行大按钮） */
  actions?: ReactNode
  /** 主行下方的额外内容（如进度条），仅少数场景需要 */
  belowContent?: ReactNode
  /** 点击整行的回调（跳转详情） */
  onClick?: () => void
  className?: string
}

export function WorkOrderListRow({
  title,
  isBatch,
  projectName,
  contactInfo,
  contactPhone,
  deviceCount,
  deviceSerials,
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
  onClick,
  className,
}: WorkOrderListRowProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col border-b border-border/50 last:border-b-0",
        "hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors cursor-pointer",
        className
      )}
    >
    <div className="flex items-center gap-3 px-3 py-2.5">
      {/* 优先级指示器 */}
      {priorityIndicator && <div className="shrink-0">{priorityIndicator}</div>}

      {/* 主信息区：标题 + 项目/联系人/故障，单行截断 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-foreground truncate max-w-[240px]">
            {title}
          </span>

          {isBatch && deviceCount !== undefined && (
            <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-5">
              {deviceCount}台
            </Badge>
          )}

          {inWarranty !== undefined && (
            inWarranty ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[11px] px-1.5 py-0 h-5">
                <ShieldCheck className="w-3 h-3 mr-0.5" />
                保修内
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[11px] px-1.5 py-0 h-5">
                <ShieldAlert className="w-3 h-3 mr-0.5" />
                过保修
              </Badge>
            )
          )}

          {isBatch && unreadCount > 0 && (
            <span className="relative inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}

          {isBatch && hasSignedPhoto && (
            <span title="已上传签字凭证" className="text-green-600">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        {/* 次要信息行：桌面端完整显示，移动端只保留关键字段 */}
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground min-w-0">
          {isBatch ? (
            <>
              <span className="truncate max-w-[180px]">
                {projectName || "未填写项目"}
              </span>
              <span className="hidden sm:inline truncate max-w-[140px]">
                {contactInfo || "无联系人"}
                {contactPhone && <span className="ml-1">({contactPhone})</span>}
              </span>
              {deviceSerials && deviceSerials.length > 0 && (
                <span className="hidden md:flex items-center gap-1 shrink-0">
                  <Package className="w-3 h-3" />
                  {deviceSerials.slice(0, 2).join(", ")}
                  {deviceSerials.length > 2 && ` +${deviceSerials.length - 2}`}
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1 truncate">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{faultText || "无故障描述"}</span>
            </span>
          )}
        </div>
      </div>

      {/* 右侧：状态 + 时间 + 提示 */}
      <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
        {statusNode}
        {reportedAt && (
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{reportedAt}</span>
        )}
        {delayedText && (
          <span className="text-[11px] text-amber-500 whitespace-nowrap">{delayedText}</span>
        )}
        {pendingSnText && (
          <span className="text-[11px] text-warning whitespace-nowrap">{pendingSnText}</span>
        )}
      </div>

      {/* 操作按钮区（紧凑，替代卡片底部整行大按钮） */}
      {actions && (
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
    {belowContent && (
      <div className="px-3 pb-2 -mt-1">{belowContent}</div>
    )}
    </div>
  )
}
