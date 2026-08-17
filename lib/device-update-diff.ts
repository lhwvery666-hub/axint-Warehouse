export interface DeviceUpdateSnapshot {
  deviceSn: unknown
  modelName: unknown
  deviceName: unknown
  faultDescription: unknown
  category: unknown
  subCategory: unknown
  materialCode: unknown
  quantity: number | null
  manufactureDate: Date | string | null
  arrivalDate: Date | string | null
}

export interface DeviceUpdateInput {
  deviceSn?: string
  modelName?: string
  deviceName?: string | null
  faultDescription?: string
  category?: string | null
  subCategory?: string | null
  materialCode?: string | null
  quantity?: number
  manufactureDate?: string | null
  arrivalDate?: string | null
}

export function normalizeDeviceText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeDate(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

/**
 * 只保留相较数据库快照真正发生变化的字段。
 * 该函数必须在服务端锁定并读取目标设备后调用，避免仅依赖前端判断。
 */
export function getChangedDeviceUpdates(
  updates: DeviceUpdateInput,
  current: DeviceUpdateSnapshot,
): DeviceUpdateInput {
  const changed: DeviceUpdateInput = {}

  if (updates.deviceSn !== undefined && normalizeDeviceText(updates.deviceSn) !== normalizeDeviceText(current.deviceSn)) {
    changed.deviceSn = updates.deviceSn
  }
  if (updates.modelName !== undefined && normalizeDeviceText(updates.modelName) !== normalizeDeviceText(current.modelName)) {
    changed.modelName = updates.modelName
  }
  if (updates.deviceName !== undefined && normalizeDeviceText(updates.deviceName) !== normalizeDeviceText(current.deviceName)) {
    changed.deviceName = updates.deviceName
  }
  if (
    updates.faultDescription !== undefined
    && normalizeDeviceText(updates.faultDescription) !== normalizeDeviceText(current.faultDescription)
  ) {
    changed.faultDescription = updates.faultDescription
  }
  if (updates.category !== undefined && normalizeDeviceText(updates.category) !== normalizeDeviceText(current.category)) {
    changed.category = updates.category
  }
  if (
    updates.subCategory !== undefined
    && normalizeDeviceText(updates.subCategory) !== normalizeDeviceText(current.subCategory)
  ) {
    changed.subCategory = updates.subCategory
  }
  if (
    updates.materialCode !== undefined
    && normalizeDeviceText(updates.materialCode) !== normalizeDeviceText(current.materialCode)
  ) {
    changed.materialCode = updates.materialCode
  }
  if (updates.quantity !== undefined && updates.quantity !== current.quantity) {
    changed.quantity = updates.quantity
  }
  if (
    updates.manufactureDate !== undefined
    && normalizeDate(updates.manufactureDate) !== normalizeDate(current.manufactureDate)
  ) {
    changed.manufactureDate = updates.manufactureDate
  }
  if (
    updates.arrivalDate !== undefined
    && normalizeDate(updates.arrivalDate) !== normalizeDate(current.arrivalDate)
  ) {
    changed.arrivalDate = updates.arrivalDate
  }

  return changed
}
