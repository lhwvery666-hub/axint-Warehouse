"use client"

import { useCallback, useEffect, useState } from "react"
import TicketCorrectionPanel from "@/components/ticket-correction-panel"
import { UserRole } from "@/lib/enums"

interface TicketCorrectionEntryProps {
  batchId: string
  role: UserRole
  onChanged: () => void | Promise<void>
}

interface CorrectionBatchResponse {
  batchId: string
  status?: string
  projectName?: string
  projectLocation?: string
  contactInfo?: string
  senderAddress?: string
  trackingNumber?: string
  expressCompany?: string
}

interface CorrectionDeviceResponse {
  id: number | string
  deviceSerialNumber?: string | null
  modelName?: string | null
  deviceName?: string | null
  category?: string | null
  subCategory?: string | null
  problem?: string | null
  quantity?: number | null
}

interface BatchDevicesResponse {
  success: boolean
  data?: {
    batchInfo: CorrectionBatchResponse
    devices: CorrectionDeviceResponse[]
  }
}

export default function TicketCorrectionEntry({ batchId, role, onChanged }: TicketCorrectionEntryProps) {
  const [data, setData] = useState<BatchDevicesResponse["data"]>()

  const loadBatch = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/batch-devices/${encodeURIComponent(batchId)}`)
      const result = await response.json() as BatchDevicesResponse
      setData(response.ok && result.success ? result.data : undefined)
    } catch (error: unknown) {
      console.error("加载工单修改入口失败:", error)
      setData(undefined)
    }
  }, [batchId])

  useEffect(() => {
    void loadBatch()
  }, [loadBatch])

  if (!data) return null

  return (
    <TicketCorrectionPanel
      batchInfo={{
        batchId: data.batchInfo.batchId,
        status: data.batchInfo.status,
        projectName: data.batchInfo.projectName || "",
        projectLocation: data.batchInfo.projectLocation || "",
        contactInfo: data.batchInfo.contactInfo || "",
        senderAddress: data.batchInfo.senderAddress || "",
        trackingNumber: data.batchInfo.trackingNumber || "",
        expressCompany: data.batchInfo.expressCompany || "",
      }}
      devices={data.devices.map((device) => ({
        id: String(device.id),
        deviceSerialNumber: device.deviceSerialNumber || "",
        modelName: device.modelName || "",
        deviceName: device.deviceName || "",
        category: device.category,
        subCategory: device.subCategory,
        problem: device.problem || "",
        quantity: device.quantity,
      }))}
      role={role}
      onChanged={async () => {
        await loadBatch()
        await onChanged()
      }}
    />
  )
}
