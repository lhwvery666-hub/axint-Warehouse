export interface DeviceUpdateSnapshot {
  deviceSn: string | null
  modelName: string | null
  deviceName: string | null
  faultDescription: string | null
  category: string | null
  subCategory: string | null
  materialCode: string | null
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

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? ""
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

  if (updates.deviceSn !== undefined && normalizeText(updates.deviceSn) !== normalizeText(current.deviceSn)) {
    changed.deviceSn = updates.deviceSn
  }
  if (updates.modelName !== undefined && normalizeText(updates.modelName) !== normalizeText(current.modelName)) {
    changed.modelName = updates.modelName
  }
  if (updates.deviceName !== undefined && normalizeText(updates.deviceName) !== normalizeText(current.deviceName)) {
    changed.deviceName = updates.deviceName
  }
  if (
    updates.faultDescription !== undefined
    && normalizeText(updates.faultDescription) !== normalizeText(current.faultDescription)
  ) {
    changed.faultDescription = updates.faultDescription
  }
  if (updates.category !== undefined && normalizeText(updates.category) !== normalizeText(current.category)) {
    changed.category = updates.category
  }
  if (
    updates.subCategory !== undefined
    && normalizeText(updates.subCategory) !== normalizeText(current.subCategory)
  ) {
    changed.subCategory = updates.subCategory
  }
  if (
    updates.materialCode !== undefined
    && normalizeText(updates.materialCode) !== normalizeText(current.materialCode)
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
