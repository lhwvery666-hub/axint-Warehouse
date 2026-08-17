"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Edit, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { UserRole } from "@/lib/enums"
import {
  CORRECTION_IMPACT,
  CORRECTION_STATE,
  canReporterEditDirectly,
  isCorrectionTerminalStatus,
} from "@/lib/ticket-correction"

interface CorrectionBatchInfo {
  batchId: string
  status?: string
  projectName: string
  projectLocation: string
  contactInfo: string
  senderAddress?: string
  trackingNumber?: string
  expressCompany?: string
}

interface CorrectionDevice {
  id: string
  deviceSerialNumber: string
  modelName: string
  deviceName: string
  category?: string | null
  subCategory?: string | null
  problem: string
  quantity?: number | null
}

interface CorrectionChange {
  label: string
  oldValue: string | number | null
  newValue: string | number | null
}

interface CorrectionRequestItem {
  requestId: number
  state: string
  createdAt: string | null
  reason: string
  impact: string
  changes: CorrectionChange[]
  requestedByName: string
}

interface TicketCorrectionPanelProps {
  batchInfo: CorrectionBatchInfo
  devices: CorrectionDevice[]
  role: UserRole
  onChanged: () => void | Promise<void>
}

const impactLabels: Record<string, string> = {
  [CORRECTION_IMPACT.NONE]: "仅更新资料，不回退流程",
  [CORRECTION_IMPACT.REPAIR_REVIEW]: "审核通过后回退到维修检查中",
  [CORRECTION_IMPACT.WAREHOUSE_REVIEW]: "审核通过后回退到待仓库确认",
}

function displayValue(value: string | number | null): string {
  if (value === null || value === "") return "未填写"
  return String(value)
}

export default function TicketCorrectionPanel({ batchInfo, devices, role, onChanged }: TicketCorrectionPanelProps) {
  const [requests, setRequests] = useState<CorrectionRequestItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [batchDraft, setBatchDraft] = useState({
    projectName: "",
    projectLocation: "",
    contactInfo: "",
    senderAddress: "",
    trackingNumber: "",
    expressCompany: "",
  })
  const [deviceDrafts, setDeviceDrafts] = useState<Array<{
    deviceId: number
    serialNumber: string
    modelName: string
    deviceName: string
    category: string
    subCategory: string
    faultDescription: string
    quantity: number
  }>>([])

  const pendingRequest = requests.find((item) => item.state === CORRECTION_STATE.PENDING)
  const isReviewer = role === UserRole.WAREHOUSE || role === UserRole.ADMIN
  const canReporterRequest = role === UserRole.REPORTER
    && !canReporterEditDirectly(batchInfo.status)
    && !isCorrectionTerminalStatus(batchInfo.status)

  const resetDraft = useCallback(() => {
    setBatchDraft({
      projectName: batchInfo.projectName || "",
      projectLocation: batchInfo.projectLocation || "",
      contactInfo: batchInfo.contactInfo || "",
      senderAddress: batchInfo.senderAddress || "",
      trackingNumber: batchInfo.trackingNumber || "",
      expressCompany: batchInfo.expressCompany || "",
    })
    setDeviceDrafts(devices.map((device) => ({
      deviceId: Number(device.id),
      serialNumber: device.deviceSerialNumber || "",
      modelName: device.modelName || "",
      deviceName: device.deviceName || "",
      category: device.category || "",
      subCategory: device.subCategory || "",
      faultDescription: device.problem || "",
      quantity: Number(device.quantity) > 0 ? Number(device.quantity) : 1,
    })))
    setReason("")
  }, [batchInfo, devices])

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tickets/correction-requests?batchId=${encodeURIComponent(batchInfo.batchId)}`)
      const result = await response.json()
      if (response.ok && result.success) setRequests(result.data || [])
    } catch (error: unknown) {
      console.error("加载修改申请失败:", error)
    } finally {
      setLoading(false)
    }
  }, [batchInfo.batchId])

  useEffect(() => {
    if ([UserRole.REPORTER, UserRole.WAREHOUSE, UserRole.ADMIN].includes(role)) {
      void loadRequests()
    }
  }, [loadRequests, role])

  const submitRequest = async () => {
    if (reason.trim().length < 5) {
      toast.error("请填写至少 5 个字的修改原因")
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch("/api/tickets/correction-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batchInfo.batchId,
          reason: reason.trim(),
          ...batchDraft,
          devices: deviceDrafts,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || "提交修改申请失败")
      toast.success("修改申请已提交，原工单流程未改变")
      setDialogOpen(false)
      await loadRequests()
      await onChanged()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "提交修改申请失败")
    } finally {
      setSubmitting(false)
    }
  }

  const reviewRequest = async (requestId: number, decision: "approve" | "reject") => {
    if (decision === "reject" && reviewNote.trim().length < 2) {
      toast.error("驳回时请填写原因")
      return
    }
    setReviewingId(requestId)
    try {
      const response = await fetch(`/api/tickets/correction-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: reviewNote.trim() || undefined }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || "审核失败")
      toast.success(decision === "approve" ? "修改已批准并应用" : "修改申请已驳回")
      setReviewNote("")
      await loadRequests()
      await onChanged()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "审核失败")
    } finally {
      setReviewingId(null)
    }
  }

  const visibleRequest = useMemo(() => pendingRequest || requests[0], [pendingRequest, requests])

  if (![UserRole.REPORTER, UserRole.WAREHOUSE, UserRole.ADMIN].includes(role)) return null
  if (!canReporterRequest && !isReviewer && requests.length === 0) return null

  return (
    <>
      <Card className={pendingRequest ? "border-amber-300 bg-amber-50/40" : ""}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Edit className="h-5 w-5" />
              工单修改申请
            </CardTitle>
            {canReporterRequest && !pendingRequest && (
              <Button variant="outline" onClick={() => { resetDraft(); setDialogOpen(true) }}>
                申请修改
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">正在读取修改申请...</p>
          ) : visibleRequest ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={visibleRequest.state === CORRECTION_STATE.PENDING ? "secondary" : "outline"}>
                  {visibleRequest.state === CORRECTION_STATE.PENDING
                    ? "待审核"
                    : visibleRequest.state === CORRECTION_STATE.APPROVED ? "已批准" : "已驳回"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  申请 #{visibleRequest.requestId} · {visibleRequest.requestedByName}
                </span>
                <span className="text-sm font-medium text-amber-700">
                  {impactLabels[visibleRequest.impact] || "需审核"}
                </span>
              </div>
              <p className="text-sm"><span className="font-medium">修改原因：</span>{visibleRequest.reason}</p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border bg-background p-3">
                {visibleRequest.changes.map((change, index) => (
                  <div key={`${change.label}-${index}`} className="grid gap-1 text-sm md:grid-cols-[220px_1fr]">
                    <span className="font-medium">{change.label}</span>
                    <span className="text-muted-foreground">
                      {displayValue(change.oldValue)} → <span className="text-foreground">{displayValue(change.newValue)}</span>
                    </span>
                  </div>
                ))}
              </div>
              {isReviewer && visibleRequest.state === CORRECTION_STATE.PENDING && (
                <div className="space-y-3 border-t pt-4">
                  <Textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="审核说明（驳回时必填）"
                    maxLength={500}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => reviewRequest(visibleRequest.requestId, "reject")}
                      disabled={reviewingId !== null}
                    >
                      <XCircle className="mr-2 h-4 w-4" />驳回
                    </Button>
                    <Button
                      onClick={() => reviewRequest(visibleRequest.requestId, "approve")}
                      disabled={reviewingId !== null}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />批准并应用
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />暂无修改申请
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>提交工单修改申请</DialogTitle>
            <DialogDescription>
              修改不会立即覆盖原数据。仓库或管理员审核后，系统会按字段影响范围决定是否回退流程。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>修改原因 *</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {([
                ["projectName", "客户名称"],
                ["projectLocation", "项目名称"],
                ["contactInfo", "联系信息"],
                ["senderAddress", "寄件地址"],
                ["trackingNumber", "寄件快递单号"],
                ["expressCompany", "寄件快递公司"],
              ] as const).map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    value={batchDraft[field]}
                    onChange={(event) => setBatchDraft((current) => ({ ...current, [field]: event.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">设备信息</h3>
              {deviceDrafts.map((device, index) => (
                <div key={device.deviceId} className="rounded-lg border p-4">
                  <p className="mb-3 font-medium">设备 {index + 1}（ID：{device.deviceId}）</p>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {([
                      ["serialNumber", "设备序列号"],
                      ["modelName", "产品型号"],
                      ["deviceName", "产品名称"],
                      ["category", "一级分类"],
                      ["subCategory", "二级分类"],
                      ["faultDescription", "故障描述"],
                    ] as const).map(([field, label]) => (
                      <div key={field} className={field === "faultDescription" ? "space-y-2 lg:col-span-2" : "space-y-2"}>
                        <Label>{label}</Label>
                        <Input
                          value={device[field]}
                          onChange={(event) => setDeviceDrafts((current) => current.map((item) => (
                            item.deviceId === device.deviceId ? { ...item, [field]: event.target.value } : item
                          )))}
                        />
                      </div>
                    ))}
                    <div className="space-y-2">
                      <Label>设备数量</Label>
                      <Input
                        type="number"
                        min={1}
                        value={device.quantity}
                        onChange={(event) => setDeviceDrafts((current) => current.map((item) => (
                          item.deviceId === device.deviceId
                            ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) }
                            : item
                        )))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting ? "提交中..." : "提交审核"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
