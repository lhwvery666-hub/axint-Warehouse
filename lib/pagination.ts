export const DEFAULT_WORK_ORDER_PAGE_SIZE = 20

function normalizePageSize(pageSize: number): number {
  return Number.isInteger(pageSize) && pageSize > 0
    ? pageSize
    : DEFAULT_WORK_ORDER_PAGE_SIZE
}

export function getTotalPages(totalItems: number, pageSize = DEFAULT_WORK_ORDER_PAGE_SIZE): number {
  const safeTotalItems = Number.isFinite(totalItems) ? Math.max(0, totalItems) : 0
  return Math.max(1, Math.ceil(safeTotalItems / normalizePageSize(pageSize)))
}

export function clampPage(
  page: number,
  totalItems: number,
  pageSize = DEFAULT_WORK_ORDER_PAGE_SIZE,
): number {
  const safePage = Number.isInteger(page) ? page : 1
  return Math.min(Math.max(1, safePage), getTotalPages(totalItems, pageSize))
}

export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize = DEFAULT_WORK_ORDER_PAGE_SIZE,
): T[] {
  const safePageSize = normalizePageSize(pageSize)
  const safePage = clampPage(page, items.length, safePageSize)
  const startIndex = (safePage - 1) * safePageSize
  return items.slice(startIndex, startIndex + safePageSize)
}
