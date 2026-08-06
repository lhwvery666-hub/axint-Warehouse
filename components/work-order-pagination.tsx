"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DEFAULT_WORK_ORDER_PAGE_SIZE, getTotalPages } from "@/lib/pagination"

interface WorkOrderPaginationProps {
  currentPage: number
  totalItems: number
  onPageChange: (page: number) => void
  pageSize?: number
}

export function WorkOrderPagination({
  currentPage,
  totalItems,
  onPageChange,
  pageSize = DEFAULT_WORK_ORDER_PAGE_SIZE,
}: WorkOrderPaginationProps) {
  const totalPages = getTotalPages(totalItems, pageSize)

  if (totalItems <= pageSize) return null

  return (
    <nav
      aria-label="工单列表分页"
      className="flex flex-col items-center justify-between gap-3 border-t border-border/60 px-3 py-4 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground">
        共 {totalItems} 条，每页 {pageSize} 条
      </p>
      <div className="flex items-center gap-2">
        <Button
          aria-label="上一页"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <span aria-live="polite" className="min-w-20 text-center text-sm font-medium">
          第 {currentPage} / {totalPages} 页
        </span>
        <Button
          aria-label="下一页"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}
