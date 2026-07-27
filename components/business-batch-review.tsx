"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Package, DollarSign, FileText, Save, CheckCircle, AlertCircle, Info, Edit, MessageSquare, Activity, Clock, Download, Send, ClipboardList, PenTool } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { TicketStatus, TICKET_STATUS_LABELS, normalizeTicketStatus, UserRole, OperationLogType } from "@/lib/enums"
import { TicketChat } from "@/components/TicketChat"
import { useAuth } from "@/context/auth-context"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { toBeijingTime } from "@/lib/utils"

interface Device {
  id: string
  deviceSerialNumber: string
  modelName: string
  deviceName: string
  status: string
  cancelRequestStatus?: string | null
  cancelRequestReason?: string | null
}

interface BatchInfo {
  batchId: string
  projectLocation: string
  contactInfo: string
  projectName: string
  deviceCount: number
  category: string
  subCategory: string
  status: string
}

interface OperationLog {
  type: string
  time: string
  operator: string
  description: string
}

// 商务审核已经处理过（授权发货及以后的终态节点），后续只需要在"财务跟进"里补充
// 收款/开票信息，不应该再触发状态推进（对应 handleSaveBusinessInfo 而非 handleConfirmBusiness）。
const POST_REVIEW_STATUSES: string[] = [
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.COMPLETED,
  TicketStatus.SCRAPPED,
  TicketStatus.RETURN_UNREPAIRED,
  TicketStatus.REJECTED_NO_RETURN,
]

interface BusinessBatchReviewProps {
  batchId: string
  onBack: () => void
  onCompleted?: () => void
  allowEdit?: boolean
}

export default function BusinessBatchReview({ batchId, onBack, onCompleted, allowEdit = true }: BusinessBatchReviewProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  const [isChargeable, setIsChargeable] = useState(false)
  const [isPaymentReceived, setIsPaymentReceived] = useState(false)
  const [isInvoiced, setIsInvoiced] = useState(false)
  const [totalCost, setTotalCost] = useState("")
  const [clientName, setClientName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 根据工单状态自动判断是否为编辑模式
  // 如果状态为 BUSINESS_REVIEW（待审核），默认可编辑
  // 如果已完成审核（WAREHOUSE_SHIPPING），默认只读，需要打回才能修改
  const [isEditMode, setIsEditMode] = useState(false)
  const [hasBusinessInfo, setHasBusinessInfo] = useState(false) // 追踪是否已有商务信息
  
  // 取消申请相关状态
  const [hasCancelRequest, setHasCancelRequest] = useState(false)
  const [cancelRequestReason, setCancelRequestReason] = useState("")
  const [isHandlingCancelRequest, setIsHandlingCancelRequest] = useState(false)


  useEffect(() => {
    fetchBatchData()
    fetchBusinessInfo()
    fetchOperationLogs()
  }, [batchId])
  
  // 根据批次状态自动设置编辑模式
  useEffect(() => {
    if (batchInfo) {
      // 如果状态为待商务审核，默认可编辑
      if (batchInfo.status === TicketStatus.BUSINESS_REVIEW) {
        setIsEditMode(true)
      } else {
        // 其他状态默认只读
        setIsEditMode(false)
      }
    }
  }, [batchInfo])

  const fetchBatchData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/tickets/batch-devices/${batchId}`)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || "获取批次数据失败")
      }

      setBatchInfo(result.data.batchInfo)
      setDevices(result.data.devices)
      
      // 检查是否有取消申请（Pending 状态）
      const pendingCancelRequest = result.data.devices.find((d: Device) => 
        d.cancelRequestStatus === "Pending"
      )
      if (pendingCancelRequest) {
        setHasCancelRequest(true)
        setCancelRequestReason(pendingCancelRequest.cancelRequestReason || "")
      }
    } catch (err: any) {
      console.error("获取批次数据失败:", err)
      setError(err.message || "加载失败")
    } finally {
      setLoading(false)
    }
  }

  const fetchBusinessInfo = async () => {
    try {
      const response = await fetch(`/api/tickets/business-info/${batchId}`)
      const result = await response.json()

      if (response.ok && result.success && result.data) {
        // 加载已保存的商务信息
        setIsChargeable(result.data.isChargeable || false)
        setIsPaymentReceived(result.data.isPaymentReceived || false)
        setIsInvoiced(result.data.isInvoiced || false)
        setTotalCost(result.data.totalCost ? result.data.totalCost.toString() : "")
        setClientName(result.data.clientName || "")
        
        // 检测是否已有商务信息（判断是首次审核还是重新编辑）
        const hasInfo = !!(result.data.clientName || result.data.totalCost || result.data.isChargeable)
        setHasBusinessInfo(hasInfo)
      } else {
        // API返回失败或无数据，说明是首次审核
        setHasBusinessInfo(false)
      }
    } catch (err: any) {
      console.error("获取商务信息失败:", err)
      setHasBusinessInfo(false)
    }
  }

  const fetchOperationLogs = async () => {
    try {
      const response = await fetch(`/api/tickets/batch-operation-logs/${batchId}`)
      const result = await response.json()

      if (response.ok && result.success) {
        setOperationLogs(result.data.operations || [])
      }
    } catch (err: any) {
      console.error("获取操作记录失败:", err)
    }
  }
  
  // 处理取消申请（批准或拒绝）
  const handleCancelRequest = async (approve: boolean) => {
    console.log("🔍 [取消申请处理] 开始处理", { approve, batchId, userId: user?.id })
    setIsHandlingCancelRequest(true)
    try {
      console.log("📤 [取消申请处理] 发送请求到API...")
      const response = await fetch(`/api/tickets/batch-cancel-approve/${batchId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approve,
          userId: user?.id
        }),
      })

      console.log("📥 [取消申请处理] 收到响应", { status: response.status, ok: response.ok })
      
      // 先检查响应状态
      if (!response.ok) {
        const errorText = await response.text()
        console.error("❌ [取消申请处理] HTTP错误", { status: response.status, body: errorText })
        throw new Error(`请求失败 (${response.status})`)
      }
      
      const result = await response.json()
      console.log("📄 [取消申请处理] 响应内容", result)
      
      if (result.success) {
        toast.success(approve ? "取消申请已批准，工单已取消" : "取消申请已拒绝")
        console.log("✅ [取消申请处理] 操作成功，重新加载数据...")
        // 重新加载数据
        await fetchBatchData()
        await fetchOperationLogs()
        console.log("✅ [取消申请处理] 数据已重新加载")
      } else {
        console.error("❌ [取消申请处理] 操作失败", result.message)
        toast.error(result.message || "操作失败")
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      console.error("❌ [取消申请处理] 异常", error)
      toast.error(`操作失败：${errorMessage}`)
    } finally {
      setIsHandlingCancelRequest(false)
      console.log("🏁 [取消申请处理] 处理完成")
    }
  }


  const handleConfirmBusiness = async () => {
    // ⚠️ 任务3：发货授权与收款/开票解耦——不再硬性阻断未收款/未开票的批次。
    // 商务可以先授权发货让货物走起来，未结清的收款/开票留给"财务跟进"视图持续处理。
    if (isChargeable && (!isPaymentReceived || !isInvoiced)) {
      const pendingParts = [
        !isPaymentReceived ? "尚未收款" : "",
        !isInvoiced ? "尚未开票" : "",
      ].filter(Boolean).join("、")
      const confirmed = window.confirm(
        `该批次工单${pendingParts}，授权发货后仍会推进到仓库发货环节，请后续在「财务跟进」中继续处理收款/开票。是否继续？`
      )
      if (!confirmed) return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tickets/business-confirm-batch/${batchId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isChargeable,
          isPaymentReceived,
          isInvoiced,
          totalCost: totalCost ? parseFloat(totalCost) : null,
          clientName: clientName.trim() || null
        }),
      })

      const result = await response.json()
      if (result.success) {
        toast.success(`商务审核完成，批次工单已转至仓库发货环节`)
        setIsEditMode(false)
        onCompleted?.()
      } else {
        toast.error(result.message || "审核失败")
      }
    } catch (error) {
      console.error("商务审核失败:", error)
      toast.error("审核失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  // 保存商务信息修改（不改变状态）
  const handleSaveBusinessInfo = async () => {
    // ⚠️ 任务3：保存是"财务跟进"的中间进度，不再强制要求先确认收款才能保存。
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tickets/business-info/${batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isChargeable,
          isPaymentReceived,
          isInvoiced,
          totalCost: totalCost ? parseFloat(totalCost) : null,
          clientName: clientName.trim() || null
        })
      })

      const result = await response.json()
      if (result.success) {
        toast.success("商务信息已更新")
        setIsEditMode(false)
        fetchBusinessInfo()
      } else {
        toast.error(result.message || "更新失败")
      }
    } catch (error) {
      console.error("更新商务信息失败:", error)
      toast.error("更新失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !batchInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-destructive font-medium">{error || "加载失败"}</p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={onBack} variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">商务审核</h1>
            <p className="text-sm text-muted-foreground">
              批次号：{batchId} | 共 {devices.length} 台设备
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={POST_REVIEW_STATUSES.includes(batchInfo.status) ? "bg-green-600" : "bg-purple-600"}>
            {POST_REVIEW_STATUSES.includes(batchInfo.status) ? "已审核" : 
             batchInfo.status === TicketStatus.BUSINESS_REVIEW ? "待审核" : "未到审核节点"}
          </Badge>
          {/* 重新编辑按钮：审核已完成（含已发货/已完成等终态）且当前为只读时显示，
              保证"财务跟进"视图里已发货甚至已完成的批次仍能继续补充收款/开票信息 */}
          {!isEditMode && (POST_REVIEW_STATUSES.includes(batchInfo.status) || batchInfo.status === TicketStatus.BUSINESS_REVIEW) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditMode(true)}
              className="flex items-center gap-1"
            >
              <Edit className="w-4 h-4" />
              重新编辑
            </Button>
          )}
        </div>
      </div>

      {/* 提示信息 */}
      <Alert className={isEditMode ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50"}>
        <Info className={`h-4 w-4 ${isEditMode ? "text-blue-600" : "text-gray-600"}`} />
        <AlertDescription className={isEditMode ? "text-blue-800" : "text-gray-800"}>
          <p className="font-medium mb-1">
            {isEditMode ? "✅ 商务审核编辑模式" : "ℹ️ 商务审核流程说明"}
          </p>
          <p className="text-sm">
            {isEditMode 
              ? "当前可编辑模式。请确认此批次工单的收款和开票情况，完成后点击底部按钮提交审核。" 
              : batchInfo.status === TicketStatus.WAREHOUSE_SHIPPING
                ? "此批次工单已完成商务审核，当前为只读模式。如需修改，请使用下方的「打回至维修」功能（即将上线）。"
                : "此批次工单尚未到达商务审核节点，暂时无法编辑。下方聊天框可正常使用以催促上游处理。"}
          </p>
        </AlertDescription>
      </Alert>

      {/* 取消申请提示 */}
      {hasCancelRequest && (
        <Alert className="border-red-300 bg-red-50">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <AlertDescription>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-red-900 mb-2">⚠️ 现场人员申请取消此批次工单</p>
                <p className="text-sm text-red-800 mb-2">
                  <strong>申请原因：</strong>{cancelRequestReason || "无"}
                </p>
                <p className="text-xs text-red-700">
                  请及时处理此取消申请。批准后，该批次工单将被取消并结束流程。
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleCancelRequest(true)}
                  disabled={isHandlingCancelRequest}
                >
                  批准取消
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCancelRequest(false)}
                  disabled={isHandlingCancelRequest}
                >
                  拒绝申请
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* 等待前置流程完成的提示 */}
      {!hasCancelRequest && 
       batchInfo.status !== TicketStatus.BUSINESS_REVIEW && 
       batchInfo.status !== TicketStatus.WAREHOUSE_SHIPPING && 
       batchInfo.status !== TicketStatus.COMPLETED && (
        <Alert className="border-yellow-300 bg-yellow-50">
          <Info className="h-5 w-5 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <p className="font-semibold mb-1">⏳ 等待前置流程完成</p>
            <p className="text-sm">
              {batchInfo.status === TicketStatus.CREATED && "此批次工单尚未经过仓库确认，暂时无法进行商务审核。"}
              {batchInfo.status === TicketStatus.WAREHOUSE_CONFIRMED && "此批次工单仓库已确认，维修人员正在进行设备检测和维修，暂时无法进行商务审核。"}
              {(batchInfo.status === TicketStatus.TECHNICIAN_REPAIRING || batchInfo.status === "Technician_Repairing") && "维修人员正在进行维修，请等待维修完成后再进行商务审核。"}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 批次基础信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            批次基础信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">项目名称</p>
              <p className="font-medium">{batchInfo.projectName || "未填写"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">项目位置</p>
              <p className="font-medium">{batchInfo.projectLocation || "未填写"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">联系信息</p>
              <p className="font-medium">{batchInfo.contactInfo || "未填写"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">产品类别</p>
              <p className="font-medium">
                {batchInfo.category || "未分类"}
                {batchInfo.subCategory && ` / ${batchInfo.subCategory}`}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">设备数量</p>
              <p className="font-medium text-lg text-primary">{devices.length} 台</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 设备清单 */}
      <Card>
        <CardHeader>
          <CardTitle>设备清单</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>序号</TableHead>
                  <TableHead>设备序列号</TableHead>
                  <TableHead>产品型号</TableHead>
                  <TableHead>物料名称</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device, index) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{device.deviceSerialNumber}</TableCell>
                    <TableCell>{device.modelName || "-"}</TableCell>
                    <TableCell>{device.deviceName || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {normalizeTicketStatus(device.status) 
                          ? TICKET_STATUS_LABELS[normalizeTicketStatus(device.status)!] 
                          : device.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 商务审核表单 */}
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            收款与开票确认
          </CardTitle>
          <CardDescription>
            请确认此批次工单的收费、收款和开票情况
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 是否收费 */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label htmlFor="isChargeable" className="text-base font-medium">是否需要收费</Label>
              <p className="text-sm text-muted-foreground mt-1">过保维修或需更换配件的设备需要收费</p>
            </div>
            <Switch
              id="isChargeable"
              checked={isChargeable}
              onCheckedChange={setIsChargeable}
              disabled={!isEditMode}
            />
          </div>

          {/* 如果收费，显示详细信息 */}
          {isChargeable && (
            <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="totalCost">维修总费用 (元) *</Label>
                <Input
                  id="totalCost"
                  type="number"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  placeholder="请输入维修总费用"
                  className="font-mono"
                  disabled={!isEditMode}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientName">客户名称</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="请输入客户名称"
                  disabled={!isEditMode}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-white rounded-md border">
                <div>
                  <Label htmlFor="isPaymentReceived" className="font-medium">是否已收款 *</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">确认客户已支付维修费用</p>
                </div>
                <Switch
                  id="isPaymentReceived"
                  checked={isPaymentReceived}
                  onCheckedChange={setIsPaymentReceived}
                  disabled={!isEditMode}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-white rounded-md border">
                <div>
                  <Label htmlFor="isInvoiced" className="font-medium">是否已开票</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">确认是否已为客户开具发票</p>
                </div>
                <Switch
                  id="isInvoiced"
                  checked={isInvoiced}
                  onCheckedChange={setIsInvoiced}
                  disabled={!isEditMode}
                />
              </div>
            </div>
          )}

          {/* 不收费说明 */}
          {!isChargeable && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                此批次工单为保内维修或免费维修，无需收款和开票。
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 确认按钮 */}
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {!isEditMode 
                    ? POST_REVIEW_STATUSES.includes(batchInfo.status) 
                      ? "商务审核已完成" 
                      : "开始商务审核"
                    : POST_REVIEW_STATUSES.includes(batchInfo.status)
                      ? "保存商务信息修改"
                      : "授权发货"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {!isEditMode 
                    ? "请点击右上角「重新编辑」按钮开始审核或修改信息"
                    : POST_REVIEW_STATUSES.includes(batchInfo.status)
                      ? "保存修改后的商务信息（如补充收款/开票状态），不改变工单状态"
                      : isChargeable 
                        ? "填写维修费用后即可授权发货；即使尚未收款/开票，也可先发货，后续在「财务跟进」中继续处理" 
                        : "确认后，批次工单将转至仓库发货环节"
                  }
                </p>
              </div>
            </div>
            {isEditMode && (
              <div className="flex items-center gap-2 flex-wrap">
                {POST_REVIEW_STATUSES.includes(batchInfo.status) ? (
                  <>
                    <Button
                      size="lg"
                      onClick={handleSaveBusinessInfo}
                      disabled={isSubmitting || (isChargeable && !totalCost)}
                      className="w-full md:w-auto min-w-[180px]"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          保存中...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Save className="w-4 h-4" />
                          保存修改
                        </span>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleSaveBusinessInfo}
                      disabled={isSubmitting || (isChargeable && !totalCost)}
                      className="w-full md:w-auto min-w-[140px]"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      保存草稿
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleConfirmBusiness}
                      disabled={isSubmitting || (isChargeable && !totalCost)}
                      className="w-full md:w-auto min-w-[180px]"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          提交中...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          授权发货
                        </span>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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

    </div>
  )
}
