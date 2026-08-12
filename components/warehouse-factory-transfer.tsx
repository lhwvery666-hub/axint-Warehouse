"use client"

import { useState } from "react"
import { ArrowLeft, CheckCircle2, Clock3, PackageCheck, Truck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toBeijingTime } from "@/lib/utils"

export interface WarehouseFactoryTransferDevice {
  id: number
  batchId: string
  sourceBatchId?: string | null
  ticketId?: string | null
  customerName?: string
  projectName: string
  projectLocation: string
  category: string
  deviceSerials?: string
  deviceModels?: string
  deviceCount: number
  supplierName?: string | null
  factoryTrackingNum?: string | null
  factoryShipDate?: string | null
  createdAt: string
  status: string
  statuses?: string
  followUpDays?: number | null
}

interface WarehouseFactoryTransferProps {
  device: WarehouseFactoryTransferDevice
  onBack: () => void
  onTransferred: () => void
}

function formatDateTime(value?: string | null): string {
  if (!value) return "未登记"
  const date = toBeijingTime(value)
  if (Number.isNaN(date.getTime())) return "未登记"
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export default function WarehouseFactoryTransfer({
  device,
  onBack,
  onTransferred,
}: WarehouseFactoryTransferProps) {
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const confirmTransfer = async () => {
    if (!checked || submitting) return
    if (!window.confirm("确认已收到并核对这台返厂设备，并移交维修人员继续维修作业？")) {
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/tickets/warehouse-factory-transfer-devices/${device.id}`,
        { method: "POST" }
      )
      const result: unknown = await response.json().catch(() => null)
      const message = result && typeof result === "object" && "message" in result
        && typeof result.message === "string"
        ? result.message
        : "移交设备失败"
      const success = result && typeof result === "object" && "success" in result
        && result.success === true

      if (!response.ok || !success) {
        toast.error(message)
        return
      }

      toast.success(message)
      onTransferred()
    } catch (error: unknown) {
      console.error("移交返厂设备失败:", error)
      toast.error("移交设备失败，请检查网络后重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack} aria-label="返回待移交列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">返厂设备收货移交</h1>
            <p className="text-sm text-muted-foreground">工单号：{device.batchId}</p>
          </div>
        </div>
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
          <Clock3 className="mr-1 h-3.5 w-3.5" />待移交
        </Badge>
      </div>

      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5 text-amber-700" />仓库跟进说明
          </CardTitle>
          <CardDescription>
            设备留在本列表期间由仓库跟进厂家维修及返程物流。收到实物后，请核对设备序列号、型号和数量，再移交维修人员作最终判断。
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />待核对设备
          </CardTitle>
          <CardDescription>
            已跟进 {Math.max(0, Number(device.followUpDays) || 0)} 天
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="客户名称" value={device.customerName || "未填写"} />
            <Info label="项目名称" value={device.projectName || "未填写"} />
            <Info label="项目位置" value={device.projectLocation || "未填写"} />
            <Info label="设备分类/名称" value={device.category || "未填写"} />
            <Info label="产品型号" value={device.deviceModels || "未填写"} />
            <Info label="设备序列号" value={device.deviceSerials || "未填写"} />
            <Info label="数量" value={`${device.deviceCount || 1} 台`} />
            <Info label="返厂厂家" value={device.supplierName || "未填写"} />
            <Info label="返厂快递单号" value={device.factoryTrackingNum || "未填写"} />
            <Info label="寄往厂家时间" value={formatDateTime(device.factoryShipDate)} />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="block font-medium">我已核对序列号、型号和实际数量</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                确认后设备将从仓库“待移交”列表移除，并回到维修人员“维修作业中”任务。
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onBack} disabled={submitting}>暂不移交</Button>
            <Button onClick={confirmTransfer} disabled={!checked || submitting}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {submitting ? "正在移交..." : "确认收货并移交维修人员"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  )
}
