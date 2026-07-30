"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Package, User, Phone, MapPin, Calendar, Hash, AlertCircle, FileText, Printer, MessageSquare, FileCheck, CheckCircle, Camera, ZoomIn, Download, Copy, X, Clock, Info, DollarSign, Activity, Send, ClipboardList, PenTool, Trash2, Edit, Upload, Loader2, Truck } from "lucide-react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { TicketChat } from "@/components/TicketChat"
import { RepairStatusTimeline } from "@/components/repair-status-timeline"
import BatchInfoEditor from "@/components/batch-info-editor"
import RepairForm from "@/components/repair-form"
import { useAuth } from "@/context/auth-context"
import { UserRole, TicketStatus, OperationLogType, normalizeTicketStatus, TERMINAL_STATUSES, REPAIR_ACTION_LABELS, RepairAction, FinalOutcome, FINAL_OUTCOME_LABELS, TICKET_STATUS_LABELS } from "@/lib/enums"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { toBeijingTime } from "@/lib/utils"
import { toast } from "sonner"
import { normalizeImageUrl } from "@/lib/storage/image-url-utils"
import { sumDeviceQuantity } from "@/lib/device-quantity"

interface BatchWorkOrderDetailProps {
  batchId: string
  onBack: () => void
}

interface Device {
  id: string
  deviceSerialNumber: string
  productSN?: string | null
  modelName: string
  deviceName: string
  status: string
  problem: string
  materialCode: string
  fullSpec: string
  faultPoint: string
  createdAt: string
  manufactureDate?: string | null
  warrantyStatus?: string | null
  warrantyStatusOverride?: string | null
  deviceImages?: string | null
  repairAction?: string | null
  quantity?: number | null
  /** 技师在 TECHNICIAN_REPAIRING 阶段填写的最终处理结果（Completed / Scrapped / ReturnUnrepaired） */
  finalOutcome?: string | null
}

interface BatchInfo {
  batchId: string
  projectLocation: string
  contactInfo: string
  projectName: string
  quantity: number
  category: string
  subCategory: string
  deviceCount: number
  signedReportPhoto?: string | null
  status?: string
  senderAddress?: string
  trackingNumber?: string
  expressCompany?: string
}

interface OperationLog {
  type: string
  time: string
  operator: string
  description: string
}

export default function BatchWorkOrderDetail({ batchId, onBack }: BatchWorkOrderDetailProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  const [isCompletingRepair, setIsCompletingRepair] = useState(false)
  
  // 已取消工单的操作状态
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRecreateDialogOpen, setIsRecreateDialogOpen] = useState(false)
  
  // 编辑工单对话框（现场人员统一编辑整个批次）
  const [isEditBatchDialogOpen, setIsEditBatchDialogOpen] = useState(false)

  // 签字凭证上传状态（现场人员在 PENDING_REPORTER_CONFIRM 阶段使用）
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null)
  const [isUploadingSignature, setIsUploadingSignature] = useState(false)

  // 盖章件附件（仅维修人员可见）
  const [stampAttachments, setStampAttachments] = useState<Array<{
    id: number; originalName: string; filePath: string; mimeType: string;
    fileSize: number; uploadedByName: string; createdAt: string;
  }>>([])
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)

  // 发货信息（仅非现场人员可见）
  const [shippingInfo, setShippingInfo] = useState<{
    shippingType?: string | null
    returnDate?: string | null
    returnTrackingNum?: string | null
    returnQuantity?: number | null
  } | null>(null)

  // 获取批次设备列表
  const fetchBatchDevices = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/tickets/batch-devices/${batchId}`)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || "获取工单设备列表失败")
      }

        setBatchInfo(result.data.batchInfo)
        setDevices(result.data.devices)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "加载失败"
      console.error("获取工单设备列表失败:", err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // 获取批次操作记录
  const fetchOperationLogs = async () => {
    try {
      const response = await fetch(`/api/tickets/batch-operation-logs/${batchId}`)
      const result = await response.json()

      if (response.ok && result.success) {
        setOperationLogs(result.data.operations || [])
      }
    } catch (err: unknown) {
      console.error("获取操作记录失败:", err)
    }
  }

  // 获取发货信息（仅非现场人员）
  const fetchShippingInfo = async () => {
    // 现场人员不能看到发货信息
    if (user?.role === UserRole.REPORTER) {
      return
    }
    
    try {
      const response = await fetch(`/api/tickets/shipping-info/${batchId}`)
      const result = await response.json()

      if (response.ok && result.success && result.data) {
        setShippingInfo({
          shippingType: result.data.shippingType || null,
          returnDate: result.data.returnDate || null,
          returnTrackingNum: result.data.returnTrackingNum || null,
          returnQuantity: result.data.returnQuantity || null,
        })
      }
    } catch (err: unknown) {
      console.error("获取发货信息失败:", err)
      // 非关键错误，不显示给用户
    }
  }

  // ── 盖章件附件（维修人员）────────────────────────────────────────────────────
  const fetchStampAttachments = async () => {
    try {
      const res = await fetch(`/api/tickets/batch-attachments/${batchId}`)
      const result = await res.json()
      if (result.success) setStampAttachments(result.data)
    } catch { /* 非关键 */ }
  }

  const MAX_ATTACH_SIZE = 10 * 1024 * 1024 // 10MB

  const handleUploadAttachment = async (file: File) => {
    if (file.size > MAX_ATTACH_SIZE) {
      alert(`文件过大，最大支持 10MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`)
      return
    }
    setIsUploadingAttachment(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", "stamp_attachment")
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData })
      const uploadResult = await uploadRes.json()
      if (!uploadRes.ok || !uploadResult.success) {
        throw new Error(uploadResult.message || "文件上传失败")
      }

      // /api/upload 的文件信息位于 data 中；旧代码读取顶层字段，导致 filePath 始终为空。
      const filePath: string | undefined = uploadResult.data?.filePath
      if (!filePath) throw new Error("上传成功，但未返回文件地址")

      const attachmentRes = await fetch(`/api/tickets/batch-attachments/${batchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          originalName: file.name,
          filePath,
          mimeType: file.type,
          fileSize: file.size,
        }),
      })
      const attachmentResult = await attachmentRes.json()
      if (!attachmentRes.ok || !attachmentResult.success) {
        throw new Error(attachmentResult.message || "附件记录保存失败")
      }

      await fetchStampAttachments()
      toast.success("盖章件附件上传成功")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败")
    } finally {
      setIsUploadingAttachment(false)
    }
  }

  const handleDeleteAttachment = async (id: number) => {
    if (!confirm("确认删除此附件？")) return
    await fetch(`/api/tickets/batch-attachments/${batchId}?id=${id}`, { method: "DELETE" })
    await fetchStampAttachments()
  }

  const handleDownloadAttachment = async (filePath: string, originalName: string) => {
    try {
      const res = await fetch(filePath)
      if (!res.ok) throw new Error("下载失败")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = originalName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // 降级：直接打开新标签页
      window.open(filePath, "_blank")
    }
  }

  useEffect(() => {
    fetchBatchDevices()
    fetchOperationLogs()
    fetchShippingInfo()
    fetchStampAttachments()
  }, [batchId, user?.role])


  // 完成维修（维修人员）
  const handleCompleteRepair = async () => {
    const confirmed = window.confirm(`确认完成批次工单的维修工作吗？\n\n完成后，批次工单将流转至商务审核环节。`)
    if (!confirmed) return

    setIsCompletingRepair(true)
    try {
      const response = await fetch(`/api/tickets/complete-repair-batch/${batchId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()
      if (result.success) {
        toast.success(`维修工作已完成，批次工单已流转至商务审核`)
        fetchBatchDevices()
      } else {
        toast.error(result.message || "操作失败")
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "操作失败，请重试"
      console.error("完成维修失败:", error)
      toast.error(errMsg)
    } finally {
      setIsCompletingRepair(false)
    }
  }

  // 删除已取消的批次工单（现场人员）
  const handleDeleteBatch = async () => {
    console.log("🗑️ [删除工单] 开始删除", { batchId })
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/tickets/batch-delete/${batchId}`, {
        method: 'DELETE',
      })

      const result = await response.json()
      console.log("📥 [删除工单] 响应", result)
      
      if (result.success) {
        toast.success(`批次工单已删除，共删除 ${result.data.deletedCount} 台设备`)
        setIsDeleteDialogOpen(false)
        // 返回列表
        onBack()
      } else {
        toast.error(result.message || "删除失败")
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "删除失败"
      console.error("❌ [删除工单] 失败", error)
      toast.error(errorMessage)
    } finally {
      setIsDeleting(false)
    }
  }

  // ── 签字凭证上传（现场人员在 PENDING_REPORTER_CONFIRM 阶段）──────────────────

  /** 处理文件选择：生成 blob 预览 URL */
  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSignatureFile(file)
    // 释放旧预览，防止内存泄漏
    if (signaturePreview) URL.revokeObjectURL(signaturePreview)
    setSignaturePreview(URL.createObjectURL(file))
  }

  /**
   * 提交签字凭证：
   * 1. 上传文件到 /api/upload，拿到持久化 filePath
   * 2. 把 filePath 以 FormData 形式 PUT 给 reporter-confirm 批量接口，
   *    该接口会同时将批次内所有设备状态推进到 Technician_Repairing
   *    并写入 SignedReportPhoto 字段
   */
  const handleUploadSignature = async () => {
    if (!signatureFile) return
    setIsUploadingSignature(true)
    try {
      // Step 1: 上传文件
      const uploadForm = new FormData()
      uploadForm.append("file", signatureFile)
      uploadForm.append("ticketId", batchId)
      uploadForm.append("type", "signature")

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: uploadForm,
      })
      const uploadResult = await uploadRes.json()

      if (!uploadResult.success) {
        toast.error(uploadResult.message || "文件上传失败")
        return
      }

      const filePath: string = uploadResult.data?.filePath || uploadResult.filePath
      if (!filePath) {
        toast.error("上传成功但未获取到文件路径，请重试")
        return
      }

      // Step 2: 通知批次接口推进状态 + 写入签字照片（发送已持久化的 filePath，避免二次上传）
      const confirmForm = new FormData()
      // 发送字符串路径，reporter-confirm 路由会将其直接写入 SignedReportPhoto 列
      // 并将批次内所有设备状态推进至 Technician_Repairing
      confirmForm.append("signedPhotoPath", filePath)

      const confirmRes = await fetch(`/api/tickets/reporter-confirm/${batchId}`, {
        method: "PUT",
        body: confirmForm,
      })
      const confirmResult = await confirmRes.json()

      if (!confirmResult.success) {
        toast.error(confirmResult.message || "凭证提交失败")
        return
      }

      toast.success("签字凭证已上传，工单已推进至维修阶段")
      // 重置上传状态
      setSignatureFile(null)
      if (signaturePreview) {
        URL.revokeObjectURL(signaturePreview)
        setSignaturePreview(null)
      }
      // 刷新页面数据
      fetchBatchDevices()
      fetchOperationLogs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失败，请重试"
      console.error("[签字凭证上传] 失败:", err)
      toast.error(msg)
    } finally {
      setIsUploadingSignature(false)
    }
  }

  // ── 使用已有签字凭证重新发送流程（流程回退后已有照片时使用）──────────────────
  const [isReconfirming, setIsReconfirming] = useState(false)

  const handleReconfirmWithExistingPhoto = async () => {
    if (!batchInfo?.signedReportPhoto) return
    setIsReconfirming(true)
    try {
      const confirmForm = new FormData()
      confirmForm.append("signedPhotoPath", batchInfo.signedReportPhoto)

      const confirmRes = await fetch(`/api/tickets/reporter-confirm/${batchId}`, {
        method: "PUT",
        body: confirmForm,
      })
      const confirmResult = await confirmRes.json()

      if (!confirmResult.success) {
        toast.error(confirmResult.message || "发送失败，请重试")
        return
      }

      toast.success("已使用原签字凭证重新发送，工单已推进至维修阶段")
      fetchBatchDevices()
      fetchOperationLogs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失败，请重试"
      console.error("[重新确认签字] 失败:", err)
      toast.error(msg)
    } finally {
      setIsReconfirming(false)
    }
  }

  // 修改并重新提交（打开创建工单对话框）
  const handleRecreateSuccess = () => {
    toast.success("新工单已创建成功！")
    setIsRecreateDialogOpen(false)
    // 返回列表
    onBack()
  }

  // 获取状态徽章
  // ⚠️ 曾经的 bug：statusMap 未覆盖 TECHNICIAN_REPAIRING/DELAYED/UNREPAIRABLE/SCRAPPED 等状态，
  // 且未命中时会 fallback 到 CREATED（"待处理"），导致这些状态的工单被误显示成"待处理"。
  // 修复：文案统一取自 TICKET_STATUS_LABELS（覆盖全部枚举），未命中样式时用灰色兜底而不是伪装成"待处理"。
  const getStatusBadge = (status: string) => {
    const normalizedStatus = normalizeTicketStatus(status || "")
    if (!normalizedStatus) return null

    const classNameMap: Partial<Record<TicketStatus, string>> = {
      [TicketStatus.CREATED]: "bg-yellow-100 text-yellow-800 border-yellow-300",
      [TicketStatus.WAREHOUSE_CONFIRMING]: "bg-orange-100 text-orange-800 border-orange-300",
      [TicketStatus.WAREHOUSE_CONFIRMED]: "bg-blue-100 text-blue-800 border-blue-300",
      [TicketStatus.IN_REPAIR]: "bg-blue-100 text-blue-800 border-blue-300",
      [TicketStatus.PENDING_REPORTER_CONFIRM]: "bg-cyan-100 text-cyan-800 border-cyan-300",
      [TicketStatus.TECHNICIAN_REPAIRING]: "bg-indigo-100 text-indigo-800 border-indigo-300",
      [TicketStatus.BUSINESS_REVIEW]: "bg-purple-100 text-purple-800 border-purple-300",
      [TicketStatus.WAREHOUSE_SHIPPING]: "bg-green-100 text-green-800 border-green-300",
      [TicketStatus.COMPLETED]: "bg-green-100 text-green-800 border-green-300",
      [TicketStatus.DELAYED]: "bg-amber-100 text-amber-800 border-amber-300",
      [TicketStatus.UNREPAIRABLE]: "bg-red-100 text-red-800 border-red-300",
      [TicketStatus.CANCELLED]: "bg-gray-100 text-gray-800 border-gray-300",
      [TicketStatus.SCRAPPED]: "bg-gray-100 text-gray-800 border-gray-300",
      [TicketStatus.RETURN_UNREPAIRED]: "bg-gray-100 text-gray-800 border-gray-300",
    }

    return (
      <Badge variant="outline" className={classNameMap[normalizedStatus] || "bg-muted text-muted-foreground border-border"}>
        {TICKET_STATUS_LABELS[normalizedStatus]}
      </Badge>
    )
  }

  // 格式化序列号显示
  // 特殊情况：最终维修状态下，序列号可以为空，不显示"未填写"
  const formatSerialNumber = (sn: string | null | undefined) => {
    const normalizedStatus = normalizeTicketStatus(batchInfo?.status || "")
    const isTerminal = normalizedStatus !== null && TERMINAL_STATUSES.includes(normalizedStatus)
    
    if (!sn || sn.trim() === "" || sn.toUpperCase() === "PENDING_VERIFY" || sn === "待验证") {
      // 最终维修状态下，序列号可以为空，返回空字符串
      return isTerminal ? "" : "未填写"
    }
    return sn
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !batchInfo) {
    return (
      <div className="p-4 md:p-6">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-semibold mb-2">加载失败</p>
            <p className="text-muted-foreground">{error || "未找到工单信息"}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      {/* 顶部返回按钮 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">
            工单详情
          </h1>
          <p className="text-sm text-muted-foreground">
            工单号：{batchId}
          </p>
        </div>
      </div>

      {/* 工单流程时间线 */}
      <Card>
        <CardContent className="pt-6">
          <RepairStatusTimeline currentStatus={batchInfo.status || "Created"} />
        </CardContent>
      </Card>

      {/* 已取消工单的后续处理 */}
      {batchInfo.status === TicketStatus.CANCELLED && user?.role === UserRole.REPORTER && (
        <Alert className="border-red-300 bg-red-50">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <AlertDescription>
            <p className="font-semibold text-red-900 mb-3">
              ⚠️ 此批次工单已被取消
            </p>
            <p className="text-sm text-red-800 mb-4">
              您可以选择删除此工单（不保留数据），或修改信息后重新提交。
            </p>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                删除工单
              </Button>
              <Button
                size="sm"
                onClick={() => setIsRecreateDialogOpen(true)}
              >
                <Edit className="w-4 h-4 mr-2" />
                修改工单
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* 工单基础信息卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              工单基础信息
            </CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              {/* 批次信息编辑按钮（现场人员和管理员可编辑） */}
              {(user?.role === UserRole.REPORTER || user?.role === UserRole.ADMIN) && batchInfo && (
                <BatchInfoEditor
                  batchInfo={{
                    batchId: batchInfo.batchId,
                    projectName: batchInfo.projectName,
                    contactInfo: batchInfo.contactInfo,
                    projectLocation: batchInfo.projectLocation,
                    senderAddress: batchInfo.senderAddress || ""
                  }}
                  onUpdated={fetchBatchDevices}
                  allowEdit={batchInfo.status !== TicketStatus.COMPLETED && batchInfo.status !== TicketStatus.CANCELLED}
                />
              )}
              {/* 只有维修人员和管理员可以编辑维修报告，且必须在仓库确认后才能编辑 */}
              {(user?.role === UserRole.TECHNICIAN || user?.role === UserRole.ADMIN) && (
                <>
                  {batchInfo?.status === TicketStatus.CREATED || batchInfo?.status === TicketStatus.WAREHOUSE_CONFIRMING ? (
                    <Button
                      variant="outline"
                      disabled
                      className="opacity-60"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      编辑维修报告（等待仓库确认）
                    </Button>
                  ) : batchInfo?.status === TicketStatus.TECHNICIAN_REPAIRING ? (
                    (() => {
                      // 一条明细可能代表多台设备，必须按 Quantity 汇总，而不是统计明细行数
                      const pendingCount = sumDeviceQuantity(devices.filter(d => !d.finalOutcome))
                      const hasBlocked   = pendingCount > 0
                      return (
                        <div className="flex flex-col items-end gap-1">
                          {hasBlocked && (
                            <p className="text-xs text-destructive font-medium">
                              ⚠️ 还有 {pendingCount} 台设备未选择最终处理结果，请在各设备详情页完成选择后再提交整批工单。
                            </p>
                          )}
                          <Button
                            variant="default"
                            onClick={handleCompleteRepair}
                            disabled={isCompletingRepair || hasBlocked}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
                          >
                            {isCompletingRepair ? (
                              <>
                                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                提交中...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                提交全部处理结果
                              </>
                            )}
                          </Button>
                        </div>
                      )
                    })()
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/repairs/edit/${batchId}`)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      编辑维修报告
                    </Button>
                  )}
                </>
              )}
              {/* 所有人都可以查看/打印维修报告 */}
              <Button
                onClick={() => router.push(`/repairs/print/${batchId}`)}
              >
                <Printer className="w-4 h-4 mr-2" />
                {user?.role === UserRole.REPORTER ? "查看维修报告" : "打印维修报告"}
              </Button>
              {/* 编辑工单：仅现场人员可以编辑，且只在维修人员介入之前（仓库确认阶段及之前）才允许修改 */}
              {user?.role === UserRole.REPORTER && (
                batchInfo?.status === TicketStatus.CREATED ||
                batchInfo?.status === TicketStatus.WAREHOUSE_CONFIRMING ||
                batchInfo?.status === TicketStatus.WAREHOUSE_CONFIRMED
              ) && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditBatchDialogOpen(true)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  编辑工单
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <Hash className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">工单号</p>
                <p className="font-medium">{batchInfo.batchId}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">客户名称</p>
                <p className="font-medium">{batchInfo.projectName || "未填写"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">项目名称</p>
                <p className="font-medium">{batchInfo.projectLocation || "未填写"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">联系信息</p>
                <p className="font-medium">{batchInfo.contactInfo || "未填写"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Hash className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">设备数量</p>
                <p className="font-medium">{batchInfo.deviceCount} 台</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 仓库确认状态提示 */}
      {batchInfo && (batchInfo.status === TicketStatus.CREATED || batchInfo.status === TicketStatus.WAREHOUSE_CONFIRMING) && (
        <Alert className="border-orange-200 bg-orange-50">
          <Clock className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <p className="font-medium mb-2">等待仓库管理员确认</p>
            <p className="text-sm">
              批次工单已创建，等待仓库管理员确认设备信息并填写出厂日期。仓库确认后，维修人员即可开始处理。
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 仓库已确认，待维修检查 */}
      {batchInfo && batchInfo.status === TicketStatus.WAREHOUSE_CONFIRMED && user?.role === UserRole.TECHNICIAN && (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <p className="font-medium mb-2">仓库已确认，可以开始检查</p>
            <p className="text-sm">
              出厂日期已填写，保修状态已确认。请点击"编辑维修报告"开始检查设备并填写维修方案。
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 待现场确认 - 维修人员视角（小提示） */}
      {batchInfo && normalizeTicketStatus(batchInfo.status) === TicketStatus.PENDING_REPORTER_CONFIRM && user?.role === UserRole.TECHNICIAN && (
        <Alert className="border-cyan-200 bg-cyan-50">
          <FileCheck className="h-4 w-4 text-cyan-600" />
          <AlertDescription className="text-cyan-800">
            <p className="font-medium mb-1">维修报告已发送，等待现场签字</p>
            <p className="text-sm">维修报告已发送给现场人员，等待对方签字回传后方可继续。</p>
          </AlertDescription>
        </Alert>
      )}

      {/* 待现场确认 - 现场人员视角（大横幅，强行动呼吁） */}
      {batchInfo && normalizeTicketStatus(batchInfo.status) === TicketStatus.PENDING_REPORTER_CONFIRM && user?.role === UserRole.REPORTER && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 overflow-hidden shadow-md">
          {/* 顶部醒目标题栏 */}
          <div className="bg-amber-400 px-6 py-3 flex items-center gap-3">
            <Upload className="h-5 w-5 text-amber-950 flex-shrink-0" />
            <span className="font-bold text-amber-950 text-base">需要您操作 — 上传签字凭证</span>
          </div>
          {/* 说明区 */}
          <div className="px-6 py-4 space-y-3">
            {batchInfo.signedReportPhoto ? (
              /* 已有签字凭证（流程回退场景） */
              <>
                <p className="text-sm text-amber-900 font-medium">
                  检测到此批次已有签字凭证（可能因仓库重新核对出厂日期导致流程回退）。
                </p>
                <p className="text-sm text-amber-800">
                  如签字内容仍有效，可直接使用原凭证发送流程；如需重新签字，可滚动至底部重新上传。
                </p>
                <div className="flex gap-3 pt-1">
                  <Button
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                    disabled={isReconfirming}
                    onClick={handleReconfirmWithExistingPhoto}
                  >
                    {isReconfirming
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />发送中...</>
                      : <><CheckCircle className="w-4 h-4 mr-2" />使用原签字凭证，发送流程</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-800 hover:bg-amber-100"
                    onClick={() => {
                      document.getElementById("signature-section")?.scrollIntoView({ behavior: "smooth" })
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    重新上传签字凭证
                  </Button>
                </div>
              </>
            ) : (
              /* 首次上传流程 */
              <>
                <p className="text-sm text-amber-900 font-medium">
                  维修工程师已完成维修报告，请按以下步骤操作：
                </p>
                <ol className="text-sm text-amber-800 space-y-1 list-decimal list-inside">
                  <li>点击右上角"<span className="font-semibold">查看维修报告</span>"按钮，打印或查看报告内容</li>
                  <li>确认报告内容无误后，请客户在纸质报告上签字</li>
                  <li>拍照并滚动至页面底部"<span className="font-semibold">签字凭证</span>"卡片上传照片</li>
                </ol>
                <div className="flex gap-3 pt-1">
                  <Button
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                    onClick={() => {
                      document.getElementById("signature-section")?.scrollIntoView({ behavior: "smooth" })
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    直接上传签字凭证
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-800 hover:bg-amber-100"
                    onClick={() => router.push(`/repairs/print/${batchId}`)}
                  >
                    <FileCheck className="w-4 h-4 mr-2" />
                    先查看维修报告
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 维修进行中 */}
      {batchInfo && batchInfo.status === TicketStatus.TECHNICIAN_REPAIRING && user?.role === UserRole.TECHNICIAN && (
        <Alert className="border-indigo-200 bg-indigo-50">
          <CheckCircle className="h-4 w-4 text-indigo-600" />
          <AlertDescription className="text-indigo-800">
            <p className="font-medium mb-2">现场已签字，可以开始维修</p>
            <p className="text-sm">
              签字凭证已收到，请查看下方签字照片。维修完成后，点击"完成维修"按钮流转至商务审核。
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 待商务审核 */}
      {batchInfo && (batchInfo.status === TicketStatus.BUSINESS_REVIEW || batchInfo.status === TicketStatus.ADMIN_REVIEW) && (
        <Alert className="border-purple-200 bg-purple-50">
          <DollarSign className="h-4 w-4 text-purple-600" />
          <AlertDescription className="text-purple-800">
            <p className="font-medium mb-2">等待商务人员审核</p>
            <p className="text-sm">
              {user?.role === UserRole.BUSINESS 
                ? "请确认收款和开票情况，审核后工单将流转至仓库发货。" 
                : "维修已完成，等待商务人员确认收款和开票。"}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 待仓库发货 */}
      {batchInfo && (batchInfo.status === TicketStatus.WAREHOUSE_SHIPPING || batchInfo.status === TicketStatus.PENDING_SHIPMENT) && (
        <Alert className="border-green-200 bg-green-50">
          <Package className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <p className="font-medium mb-2">等待仓库管理员发货</p>
            <p className="text-sm">
              {user?.role === UserRole.WAREHOUSE 
                ? "商务审核已完成，请安排出库发回客户或产品入库。" 
                : "商务审核已完成，等待仓库管理员安排发货。"}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 已完成 */}
      {batchInfo && batchInfo.status === TicketStatus.COMPLETED && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <p className="font-medium mb-2">批次工单已完成</p>
            <p className="text-sm">
              所有流程已完成，设备已发回客户或入库。感谢您的辛勤工作！
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 设备列表 */}
      <Card>
        <CardHeader>
          <CardTitle>设备列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>序号</TableHead>
                  <TableHead>设备序列号</TableHead>
                  <TableHead>产品型号</TableHead>
                  {/* 物料名称仅内部人员可见 */}
                  {user?.role !== UserRole.REPORTER && <TableHead>物料名称</TableHead>}
                  <TableHead>出厂日期</TableHead>
                  <TableHead>保修状态</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>故障描述</TableHead>
                  {/* 处理结果仅技师可见 */}
                  {user?.role === UserRole.TECHNICIAN && <TableHead>处理结果</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length > 0 ? (
                  devices.map((device, index) => (
                    <TableRow
                      key={device.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        // 点击设备行，跳转到单个设备的工作台页面
                        router.push(`/repairs/detail/${device.id}`)
                      }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-mono">
                        {formatSerialNumber(device.deviceSerialNumber)}
                      </TableCell>
                      <TableCell>{device.modelName || "-"}</TableCell>
                      {/* 物料名称仅内部人员可见 */}
                      {user?.role !== UserRole.REPORTER && <TableCell>{device.deviceName || "-"}</TableCell>}
                      <TableCell>
                        {device.manufactureDate ? (
                          <span className="text-sm">
                            {format(new Date(device.manufactureDate), "yyyy-MM-dd", { locale: zhCN })}
                          </span>
                        ) : (
                          <span className="text-orange-600 text-sm font-medium">待填写</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // 优先使用手动覆盖值（warrantyStatusOverride），其次使用自动计算值（warrantyStatus）
                          const effectiveWarranty = device.warrantyStatusOverride || device.warrantyStatus
                          if (!device.manufactureDate && !effectiveWarranty) {
                            return <Badge variant="secondary">未检查</Badge>
                          }
                          if (effectiveWarranty === "InWarranty") {
                            return <Badge variant="default" className="bg-green-600">保内</Badge>
                          }
                          if (effectiveWarranty === "OutOfWarranty") {
                            return <Badge variant="outline" className="border-orange-500 text-orange-700">过保</Badge>
                          }
                          return <Badge variant="secondary">未知</Badge>
                        })()}
                      </TableCell>
                      <TableCell>{getStatusBadge(device.status)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {device.problem || "无"}
                      </TableCell>
                      {/* 处理结果列：仅技师可见 */}
                      {user?.role === UserRole.TECHNICIAN && (
                        <TableCell>
                          {/* TECHNICIAN_REPAIRING 阶段：显示最终处理结果 */}
                          {normalizeTicketStatus(batchInfo?.status || "") === TicketStatus.TECHNICIAN_REPAIRING ? (
                            device.finalOutcome ? (
                              <Badge className={
                                device.finalOutcome === FinalOutcome.COMPLETED
                                  ? "bg-green-100 text-green-800 border-green-300 hover:bg-green-100"
                                  : device.finalOutcome === FinalOutcome.SCRAPPED
                                  ? "bg-red-100 text-red-800 border-red-300 hover:bg-red-100"
                                  : "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-100"
                              }>
                                {FINAL_OUTCOME_LABELS[device.finalOutcome as FinalOutcome] ?? device.finalOutcome}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-destructive border-destructive/30">
                                未选择
                              </Badge>
                            )
                          ) : (
                            /* 其他阶段：显示维修动作 */
                            device.repairAction ? (
                              <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
                                🟢 {REPAIR_ACTION_LABELS[device.repairAction as RepairAction] ?? device.repairAction}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-muted-foreground">
                                ⚪ 待处理
                              </Badge>
                            )
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={
                        user?.role === UserRole.REPORTER ? 7
                        : user?.role === UserRole.TECHNICIAN ? 9
                        : 8
                      }
                      className="text-center text-muted-foreground py-8"
                    >
                      暂无设备数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 发货信息（仅非现场人员可见） */}
      {user?.role !== UserRole.REPORTER && shippingInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              发货信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shippingInfo.shippingType === "return" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-medium">发回客户</span>
                  </div>
                  {shippingInfo.returnDate && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">发货日期</p>
                        <p className="font-medium">
                          {format(new Date(shippingInfo.returnDate), "yyyy-MM-dd", { locale: zhCN })}
                        </p>
                      </div>
                      {shippingInfo.returnTrackingNum && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">快递单号</p>
                          <p className="font-mono font-medium">{shippingInfo.returnTrackingNum}</p>
                        </div>
                      )}
                      {shippingInfo.returnQuantity && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">发货数量</p>
                          <p className="font-medium">{shippingInfo.returnQuantity} 台</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : shippingInfo.shippingType === "stock" ? (
                <div className="flex items-center gap-2 text-blue-700">
                  <Package className="w-4 h-4" />
                  <span className="font-medium">产品入库</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无发货信息</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 工单沟通记录与操作记录 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：工单沟通记录 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              工单沟通记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TicketChat 
              ticketId={batchId}
              currentUser={{
                name: user?.realName || user?.username || "未知用户",
                role: (user?.role || "admin") as UserRole
              }}
            />
          </CardContent>
        </Card>

        {/* 右侧：操作记录 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              操作记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {operationLogs.length > 0 ? (
                operationLogs.map((log, index) => {
                  // 根据操作类型设置图标和颜色（使用枚举）
                  let IconComponent = Clock
                  let iconColor = "text-primary"
                  let bgColor = "bg-primary/10"

                  if (log.type === OperationLogType.CREATED) {
                    IconComponent = FileText
                    iconColor = "text-blue-600"
                    bgColor = "bg-blue-100"
                  } else if (log.type === OperationLogType.SUBMITTED) {
                    IconComponent = Send
                    iconColor = "text-sky-600"
                    bgColor = "bg-sky-100"
                  } else if (log.type === OperationLogType.WAREHOUSE_CONFIRMED) {
                    IconComponent = Package
                    iconColor = "text-purple-600"
                    bgColor = "bg-purple-100"
                  } else if (log.type === OperationLogType.REPAIR_REPORT_GENERATED) {
                    IconComponent = ClipboardList
                    iconColor = "text-indigo-600"
                    bgColor = "bg-indigo-100"
                  } else if (log.type === OperationLogType.REPORTER_CONFIRMED) {
                    IconComponent = PenTool
                    iconColor = "text-pink-600"
                    bgColor = "bg-pink-100"
                  } else if (log.type === OperationLogType.TECHNICIAN_COMPLETED) {
                    IconComponent = CheckCircle
                    iconColor = "text-green-600"
                    bgColor = "bg-green-100"
                  } else if (log.type === OperationLogType.BUSINESS_REVIEWED) {
                    IconComponent = DollarSign
                    iconColor = "text-orange-600"
                    bgColor = "bg-orange-100"
                  } else if (log.type === OperationLogType.BUSINESS_REVIEW_SKIPPED) {
                    IconComponent = CheckCircle
                    iconColor = "text-slate-600"
                    bgColor = "bg-slate-100"
                  } else if (log.type === OperationLogType.WAREHOUSE_SHIPPED) {
                    IconComponent = Download
                    iconColor = "text-teal-600"
                    bgColor = "bg-teal-100"
                  }

                  return (
                    <div key={index} className="flex gap-3 items-start">
                      <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center shrink-0`}>
                        <IconComponent className={`h-5 w-5 ${iconColor}`} />
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{log.operator}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(toBeijingTime(log.time), "MM-dd HH:mm", { locale: zhCN })}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{log.description}</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">暂无操作记录</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 签字凭证 */}
      {/* id 用于顶部行动横幅的锚点滚动 */}
      {(() => {
        const normalizedBatchStatus = normalizeTicketStatus(batchInfo.status || "")
        // 满足上传条件：PENDING_REPORTER_CONFIRM 状态 + REPORTER 角色 + 尚未上传凭证
        const canUploadSignature =
          normalizedBatchStatus === TicketStatus.PENDING_REPORTER_CONFIRM &&
          user?.role === UserRole.REPORTER &&
          !batchInfo.signedReportPhoto

        return (
          <Card id="signature-section" className={canUploadSignature ? "border-cyan-300 shadow-md" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5" />
                签字凭证
                {batchInfo.signedReportPhoto ? (
                  <Badge variant="default" className="ml-2 bg-green-600">已上传</Badge>
                ) : canUploadSignature ? (
                  <Badge variant="outline" className="ml-2 border-cyan-400 text-cyan-700">待上传</Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {batchInfo.signedReportPhoto ? (
                /* ── 已有凭证：展示图片 ────────────────────────────────────── */
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-900">现场人员已上传签字凭证</p>
                        <p className="text-sm text-green-700">客户已在打印的维修报告上签字确认</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg p-4 bg-white">
                    {(() => {
                      const normalizedPhotoUrl = normalizeImageUrl(batchInfo.signedReportPhoto)
                      return (
                        <>
                          <img 
                            src={normalizedPhotoUrl} 
                            alt="签字凭证" 
                            className="w-full max-w-md mx-auto rounded-lg shadow-sm"
                          />
                          <div className="flex items-center justify-center gap-2 mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const win = window.open("")
                                win?.document.write(`
                                  <html>
                                    <head><title>签字凭证</title></head>
                                    <body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#000;">
                                      <img src="${normalizedPhotoUrl}" style="max-width:100%;max-height:100vh;object-fit:contain;" />
                                    </body>
                                  </html>
                                `)
                              }}
                            >
                              <ZoomIn className="w-4 h-4 mr-2" />
                              查看大图
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const link = document.createElement("a")
                                link.href = normalizedPhotoUrl
                                link.download = `签字凭证_${batchId}.jpg`
                                link.click()
                              }}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              下载照片
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(normalizedPhotoUrl)
                                toast.success("已复制图片链接到剪贴板")
                              }}
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              复制链接
                            </Button>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              ) : canUploadSignature ? (
                /* ── 待上传：REPORTER 在 PENDING_REPORTER_CONFIRM 阶段的操作区 ── */
                <div className="space-y-4">
                  {/* 提示横幅 */}
                  <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <FileCheck className="h-5 w-5 text-cyan-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-cyan-900">需要上传签字凭证</p>
                        <p className="text-sm text-cyan-700">
                          维修工程师已提交维修报告并等待您确认。请打印报告，让客户签字后拍照上传，
                          工单将自动推进至维修阶段。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 文件选择区 */}
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-6">
                    {signaturePreview ? (
                      /* 已选文件：预览 + 替换按钮 */
                      <div className="space-y-3">
                        <img
                          src={signaturePreview}
                          alt="签字凭证预览"
                          className="max-h-64 mx-auto rounded-lg shadow-sm object-contain"
                        />
                        <div className="flex items-center justify-center gap-2">
                          <p className="text-sm text-gray-600 truncate max-w-[200px]">
                            {signatureFile?.name}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-gray-700 h-auto p-1"
                            onClick={() => {
                              setSignatureFile(null)
                              if (signaturePreview) URL.revokeObjectURL(signaturePreview)
                              setSignaturePreview(null)
                            }}
                            disabled={isUploadingSignature}
                          >
                            <X className="w-4 h-4" />
                            <span className="sr-only">移除</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* 未选文件：上传占位区 */
                      <label className="flex flex-col items-center gap-3 cursor-pointer">
                        <div className="inline-flex items-center justify-center w-14 h-14 bg-cyan-50 rounded-full">
                          <Camera className="h-7 w-7 text-cyan-500" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-gray-700">点击选择签字凭证照片</p>
                          <p className="text-sm text-gray-400 mt-0.5">支持 JPG、PNG、HEIC 等图片格式</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={handleSignatureFileChange}
                          disabled={isUploadingSignature}
                        />
                      </label>
                    )}
                  </div>

                  {/* 提交按钮 */}
                  <Button
                    className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
                    size="lg"
                    disabled={!signatureFile || isUploadingSignature}
                    onClick={handleUploadSignature}
                  >
                    {isUploadingSignature ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        上传中，请稍候…
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        确认并上传凭证
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                /* ── 其他角色或其他状态：纯展示占位 ────────────────────────── */
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <Camera className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium mb-1">暂无签字凭证</p>
                  <p className="text-sm text-gray-500">现场人员确认后会上传客户签字的报告照片</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* 盖章件附件（所有人可见） */}
      {batchInfo && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="w-4 h-4" />
                盖章件附件
              </CardTitle>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={isUploadingAttachment}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUploadAttachment(file)
                    e.target.value = ""
                  }}
                />
                <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  {isUploadingAttachment ? "上传中..." : "上传附件"}
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">支持图片和 PDF，单文件最大 10MB</p>
          </CardHeader>
          <CardContent>
            {stampAttachments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">暂无附件，可上传盖章后的报告文件</p>
            ) : (
              <div className="space-y-2">
                {stampAttachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{att.originalName}</p>
                        <p className="text-xs text-muted-foreground">
                          {att.uploadedByName} · {(att.fileSize / 1024).toFixed(0)} KB · {new Date(att.createdAt).toLocaleString("zh-CN")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => handleDownloadAttachment(att.filePath, att.originalName)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-muted transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        下载
                      </button>
                      <button
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              确认删除批次工单
            </DialogTitle>
            <DialogDescription>
              此操作将<span className="font-semibold text-destructive">永久删除</span>批次号 <span className="font-mono font-semibold">{batchId}</span> 下的所有 {sumDeviceQuantity(devices)} 台设备工单，数据无法恢复！
            </DialogDescription>
          </DialogHeader>

          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 text-sm">
              <p className="font-medium mb-1">⚠️ 警告</p>
              <p>删除后，所有设备信息、维修记录、聊天记录都将被清除，此操作不可撤销！</p>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBatch}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改工单对话框 */}
      <Dialog open={isRecreateDialogOpen} onOpenChange={setIsRecreateDialogOpen}>
        <DialogContent className="sm:max-w-[98vw] md:max-w-[95vw] lg:max-w-[90vw] max-h-[95vh] flex flex-col p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>修改工单信息</DialogTitle>
            <DialogDescription>
              已为您预填充原工单信息，请修改有问题的部分后保存
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1">
            <RepairForm
              taskId={null}
              onBack={() => {
                toast.success("工单已更新！")
                setIsRecreateDialogOpen(false)
                fetchBatchDevices() // 刷新数据
              }}
              userType="reporter"
              updateMode={{
                enabled: true,
                batchId: batchId
              }}
              initialData={{
                senderAddress: batchInfo?.senderAddress || "",
                customerName: batchInfo?.projectName || "",
                // ContactInfo 格式："联系人 电话"，需要解析
                contactPerson: (() => {
                  const info = batchInfo?.contactInfo || "";
                  // 尝试用空格分割
                  const parts = info.trim().split(/\s+/);
                  return parts.length > 1 ? parts[0] : "";
                })(),
                contactPhone: (() => {
                  const info = batchInfo?.contactInfo || "";
                  // 尝试用空格分割
                  const parts = info.trim().split(/\s+/);
                  return parts.length > 1 ? parts.slice(1).join(" ") : info;
                })(),
                projectLocation: batchInfo?.projectLocation || "",
                trackingNumber: batchInfo?.trackingNumber || "",
                expressCompany: batchInfo?.expressCompany || "",
                category: batchInfo?.category || "",
                subCategory: batchInfo?.subCategory || "",
                devices: devices.map(device => ({
                  serialNumber: device.productSN || device.deviceSerialNumber || "",
                  faultDescription: device.faultPoint || device.problem || "",
                  deviceName: device.deviceName || "",
                  deviceModel: device.modelName || "",
                  category: batchInfo?.category || "",
                  subCategory: batchInfo?.subCategory || "",
                  quantity: device.quantity,
                  deviceImages: device.deviceImages || undefined
                }))
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑工单对话框（现场人员统一编辑整个批次） */}
      <Dialog open={isEditBatchDialogOpen} onOpenChange={setIsEditBatchDialogOpen}>
        <DialogContent className="sm:max-w-[98vw] md:max-w-[95vw] lg:max-w-[90vw] max-h-[95vh] flex flex-col p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>编辑工单信息</DialogTitle>
            <DialogDescription>
              编辑批次工单的所有信息
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1">
            <RepairForm
              taskId={null}
              onBack={() => {
                toast.success("工单已更新！")
                setIsEditBatchDialogOpen(false)
                fetchBatchDevices() // 刷新数据
                fetchOperationLogs() // 刷新操作记录
              }}
              userType="reporter"
              updateMode={{
                enabled: true,
                batchId: batchId
              }}
              initialData={batchInfo ? {
                senderAddress: batchInfo.senderAddress || "",
                customerName: batchInfo.projectName || "",
                projectLocation: batchInfo.projectLocation || "",
                contactPerson: (() => {
                  const info = batchInfo.contactInfo || "";
                  const parts = info.trim().split(/\s+/);
                  return parts.length > 1 ? parts[0] : "";
                })(),
                contactPhone: (() => {
                  const info = batchInfo.contactInfo || "";
                  const parts = info.trim().split(/\s+/);
                  return parts.length > 1 ? parts.slice(1).join(" ") : "";
                })(),
                trackingNumber: batchInfo.trackingNumber || "",
                expressCompany: batchInfo.expressCompany || "",
                category: batchInfo.category || "",
                subCategory: batchInfo.subCategory || "",
                devices: devices.map(d => ({
                  serialNumber: d.deviceSerialNumber,
                  deviceModel: d.modelName,
                  faultDescription: d.problem,
                  category: batchInfo.category || "",
                  subCategory: batchInfo.subCategory || "",
                  quantity: d.quantity,
                  deviceImages: d.deviceImages || undefined
                }))
              } : undefined}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
