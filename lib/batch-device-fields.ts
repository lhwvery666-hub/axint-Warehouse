/** Apply a partial submission without turning omitted fields into empty values. */
export function preserveBatchDeviceFields(
  submitted: Record<string, unknown>,
  existing: { sn: string; modelName: string; quantity: number; deviceName: string | null; faultDescription: string | null; materialCode: string | null },
): Record<string, unknown> {
  return {
    serialNumber: existing.sn,
    modelName: existing.modelName,
    quantity: existing.quantity,
    deviceName: existing.deviceName,
    faultDescription: existing.faultDescription,
    materialCode: existing.materialCode,
    ...Object.fromEntries(Object.entries(submitted).filter(([, value]) => value !== undefined)),
  }
}
