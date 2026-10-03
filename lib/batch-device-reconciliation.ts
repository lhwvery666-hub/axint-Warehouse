export interface SubmittedBatchDeviceIdentity {
  deviceId?: number
}

export interface BatchDeviceReconciliationPlan {
  mode: "stable-id"
  updates: Array<{ submittedIndex: number; deviceId: number }>
  inserts: number[]
  deletes: number[]
}

export interface BatchDeviceEditSnapshot {
  expectedDeviceIds: readonly number[]
  deletedDeviceIds?: readonly number[]
}

export class BatchDeviceReconciliationError extends Error {
  constructor(
    public readonly code: "DUPLICATE_DEVICE_ID" | "UNKNOWN_DEVICE_ID" | "STALE_DEVICE_LIST" | "INVALID_DELETION",
    message: string,
  ) {
    super(message)
    this.name = "BatchDeviceReconciliationError"
  }
}

/** Check the original membership before any mutation; never infer deletion from omission. */
export function planBatchDeviceReconciliation(
  existingDeviceIds: readonly number[],
  submittedDevices: readonly SubmittedBatchDeviceIdentity[],
  snapshot: BatchDeviceEditSnapshot,
): BatchDeviceReconciliationPlan {
  const existingIdSet = new Set(existingDeviceIds)
  const expectedIdSet = new Set(snapshot.expectedDeviceIds)
  if (expectedIdSet.size !== snapshot.expectedDeviceIds.length ||
      existingIdSet.size !== expectedIdSet.size ||
      existingDeviceIds.some((id) => !expectedIdSet.has(id))) {
    throw new BatchDeviceReconciliationError("STALE_DEVICE_LIST", "设备清单已变化，请刷新后重新编辑")
  }

  const submittedIds = submittedDevices.flatMap((device) => device.deviceId === undefined ? [] : [device.deviceId])
  const uniqueSubmittedIds = new Set(submittedIds)
  if (uniqueSubmittedIds.size !== submittedIds.length) {
    throw new BatchDeviceReconciliationError("DUPLICATE_DEVICE_ID", "提交的数据包含重复设备 ID")
  }
  if (submittedIds.some((id) => !existingIdSet.has(id))) {
    throw new BatchDeviceReconciliationError("UNKNOWN_DEVICE_ID", "设备不属于当前批次")
  }

  const deletes = [...(snapshot.deletedDeviceIds ?? [])]
  if (new Set(deletes).size !== deletes.length ||
      deletes.some((id) => !expectedIdSet.has(id) || uniqueSubmittedIds.has(id))) {
    throw new BatchDeviceReconciliationError("INVALID_DELETION", "删除设备清单与当前提交不一致")
  }
  return {
    mode: "stable-id",
    updates: submittedDevices.flatMap((device, submittedIndex) => device.deviceId === undefined ? [] : [{ submittedIndex, deviceId: device.deviceId }]),
    inserts: submittedDevices.flatMap((device, submittedIndex) => device.deviceId === undefined ? [submittedIndex] : []),
    deletes,
  }
}
