/** Ignore a response if the user changed SN or selected the unreadable-label option. */
export function applyDeviceCheckResult<T extends { serialNumber: string; isSnPendingVerify: boolean }>(
  current: T,
  requestedSn: string,
  result: Partial<T>,
): T {
  if (current.isSnPendingVerify || current.serialNumber.trim() !== requestedSn) return current
  return { ...current, ...result }
}
