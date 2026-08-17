export interface SubmittedBatchDeviceIdentity {
  deviceId?: number
}

export interface BatchDeviceReconciliationPlan {
  mode: "stable-id" | "legacy-order"
  updates: Array<{ submittedIndex: number; deviceId: number }>
  inserts: number[]
  deletes: number[]
}

export class BatchDeviceReconciliationError extends Error {
  constructor(
    public readonly code: "DUPLICATE_DEVICE_ID" | "UNKNOWN_DEVICE_ID",
    message: string,
  ) {
    super(message)
    this.name = "BatchDeviceReconciliationError"
  }
}

/**
 * Reconcile an edited batch without relying on the current array order.
 *
 * Existing edit forms submit stable database IDs. The legacy-order fallback is
 * kept only for the post-create photo synchronization path, whose records have
 * just been created and do not yet have IDs in the browser.
 */
export function planBatchDeviceReconciliation(
  existingDeviceIds: readonly number[],
  submittedDevices: readonly SubmittedBatchDeviceIdentity[],
): BatchDeviceReconciliationPlan {
  const submittedIds = submittedDevices
    .map((device) => device.deviceId)
    .filter((deviceId): deviceId is number => deviceId !== undefined)

  if (submittedIds.length === 0) {
    const sharedLength = Math.min(existingDeviceIds.length, submittedDevices.length)
    return {
      mode: "legacy-order",
      updates: Array.from({ length: sharedLength }, (_, submittedIndex) => ({
        submittedIndex,
        deviceId: existingDeviceIds[submittedIndex],
      })),
      inserts: Array.from(
        { length: Math.max(0, submittedDevices.length - sharedLength) },
        (_, offset) => sharedLength + offset,
      ),
      deletes: existingDeviceIds.slice(sharedLength),
    }
  }

  const uniqueSubmittedIds = new Set(submittedIds)
  if (uniqueSubmittedIds.size !== submittedIds.length) {
    throw new BatchDeviceReconciliationError(
      "DUPLICATE_DEVICE_ID",
      "提交的数据包含重复设备 ID",
    )
  }

  const existingIdSet = new Set(existingDeviceIds)
  const unknownId = submittedIds.find((deviceId) => !existingIdSet.has(deviceId))
  if (unknownId !== undefined) {
    throw new BatchDeviceReconciliationError(
      "UNKNOWN_DEVICE_ID",
      `设备 ${unknownId} 不属于当前批次`,
    )
  }

  return {
    mode: "stable-id",
    updates: submittedDevices.flatMap((device, submittedIndex) => (
      device.deviceId === undefined
        ? []
        : [{ submittedIndex, deviceId: device.deviceId }]
    )),
    inserts: submittedDevices.flatMap((device, submittedIndex) => (
      device.deviceId === undefined ? [submittedIndex] : []
    )),
    deletes: existingDeviceIds.filter((deviceId) => !uniqueSubmittedIds.has(deviceId)),
  }
}
