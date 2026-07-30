"use client"

import type { ReactNode } from "react"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { ALL_REPAIR_STATUS_FILTER } from "@/lib/repair-list-filters"
import { cn } from "@/lib/utils"

export interface WorkOrderStatusOption {
  value: string
  label: string
}

interface WorkOrderFilterBarProps {
  workOrderQuery: string
  customerQuery: string
  deviceQuery: string
  status: string
  statusOptions: readonly WorkOrderStatusOption[]
  onWorkOrderQueryChange: (value: string) => void
  onCustomerQueryChange: (value: string) => void
  onDeviceQueryChange: (value: string) => void
  onStatusChange: (value: string) => void
  trailing?: ReactNode
  className?: string
}

export function WorkOrderFilterBar({
  workOrderQuery,
  customerQuery,
  deviceQuery,
  status,
  statusOptions,
  onWorkOrderQueryChange,
  onCustomerQueryChange,
  onDeviceQueryChange,
  onStatusChange,
  trailing,
  className,
}: WorkOrderFilterBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-40 grid grid-cols-1 gap-3 rounded-2xl border border-border/70 bg-card/90 p-2 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.7)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/80",
        "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
        "hover:border-primary/20 hover:bg-card/90 hover:shadow-md",
        "focus-within:border-primary/35 focus-within:bg-card/95 focus-within:shadow-[0_14px_32px_-24px_rgba(37,99,235,0.55)]",
        "motion-reduce:transition-none sm:grid-cols-2",
        trailing ? "xl:grid-cols-5" : "xl:grid-cols-4",
        className,
      )}
    >
      <FilterInput
        ariaLabel="搜索工单号"
        placeholder="工单号搜索"
        testId="work-order-filter"
        value={workOrderQuery}
        onChange={onWorkOrderQueryChange}
      />
      <FilterInput
        ariaLabel="搜索客户或用户名"
        placeholder="客户/用户名搜索"
        testId="customer-user-filter"
        value={customerQuery}
        onChange={onCustomerQueryChange}
      />
      <FilterInput
        ariaLabel="搜索设备SN或型号"
        placeholder="设备SN/型号搜索"
        testId="device-filter"
        value={deviceQuery}
        onChange={onDeviceQueryChange}
      />
      <select
        aria-label="筛选工单状态"
        className="h-10 w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-primary/30 hover:bg-background hover:shadow-sm focus:-translate-y-px focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/15 focus:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
        data-testid="status-filter"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
      >
        <option value={ALL_REPAIR_STATUS_FILTER}>全部状态</option>
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {trailing && (
        <div className="flex min-w-0 gap-2 sm:col-span-2 xl:col-span-1">
          {trailing}
        </div>
      )}
    </div>
  )
}

interface FilterInputProps {
  ariaLabel: string
  placeholder: string
  testId: string
  value: string
  onChange: (value: string) => void
}

function FilterInput({ ariaLabel, placeholder, testId, value, onChange }: FilterInputProps) {
  return (
    <div className="group relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground group-focus-within:scale-110 group-focus-within:text-primary motion-reduce:transform-none" />
      <Input
        aria-label={ariaLabel}
        className="h-10 rounded-lg bg-background/80 pl-10 transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-primary/30 hover:bg-background hover:shadow-sm focus-visible:-translate-y-px focus-visible:bg-background focus-visible:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
        data-testid={testId}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
