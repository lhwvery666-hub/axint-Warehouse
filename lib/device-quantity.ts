export interface DeviceQuantityRecord {
  quantity?: number | null
}

/**
 * 一条设备明细可能代表多台同型号设备，不能直接用明细数组长度作为设备数量。
 */
export function getDeviceQuantity(device: DeviceQuantityRecord): number {
  const quantity = Number(device.quantity)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

export function sumDeviceQuantity(devices: readonly DeviceQuantityRecord[]): number {
  return devices.reduce((total, device) => total + getDeviceQuantity(device), 0)
}
