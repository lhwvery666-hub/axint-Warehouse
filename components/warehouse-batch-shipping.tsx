"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Package, Truck, Calendar as CalendarIcon, Save, CheckCircle, AlertCircle, Info, Archive, MessageSquare, Activity, Clock, FileText, DollarSign, Download, Send, ClipboardList, PenTool, Pencil, X, ChevronDown, ChevronUp, ImageOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { normalizeImageUrl } from "@/lib/storage/image-url-utils"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { toBeijingTime } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { TicketStatus, TICKET_STATUS_LABELS, normalizeTicketStatus, UserRole, OperationLogType, REPAIR_ACTION_LABELS, RepairAction, FINAL_OUTCOME_LABELS, FinalOutcome } from "@/lib/enums"
import { TicketChat } from "@/components/TicketChat"
import { useAuth } from "@/context/auth-context"

interface Device {
  id: string
  deviceSerialNumber: string
  modelName: string
  deviceName: string
  status: string
  manufactureDate?: string | null
  deviceImages?: string | null   // 现场上传的设备图片（JSON数组或逗号分隔路径）
  problem?: string | null        // 故障描述
  faultPoint?: string | null     // 故障点
  repairAction?: string | null   // 维修处理方式
  finalOutcome?: string | null   // 最终处置结果
  quantity?: number              // 设备数量
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
  trackingNumber?: string
  expressCompany?: string
  factoryTrackingNum?: string | null
  factoryShipDate?: string | null
}

interface WarehouseBatchShippingProps {
  batchId: string
  onBack: () => void
  onCompleted?: () => void
  allowEdit?: boolean
}

interface OperationLog {
  type: string
  time: string
  operator: string
  description: string
}

export default function WarehouseBatchShipping({ batchId, onBack, onCompleted, allowEdit = true }: WarehouseBatchShippingProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  const [shippingType, setShippingType] = useState<"return" | "stock">("return")
  const [returnDate, setReturnDate] = useState<Date | null>(null)
  const [returnTrackingNum, setReturnTrackingNum] = useState("")
  const [returnQuantity, setReturnQuantity] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDates, setIsSavingDates] = useState(false)
  const [manufactureDates, setManufactureDates] = useState<Record<string, Date | null>>({})

  // ── 返厂快递信息 ──────────────────────────────────────────────────────────────
  const [factoryTrackingInput, setFactoryTrackingInput] = useState("")
  const [isSavingFactoryTracking, setIsSavingFactoryTracking] = useState(false)

  // ── 双轨独立编辑模式 ──────────────────────────────────────────────────────────
  // isEditShippingMode: 控制"发货方式"表单的编辑（可能回退状态至 WAREHOUSE_SHIPPING）
  const [isEditShippingMode, setIsEditShippingMode] = useState(false)
  // isEditDateMode: 控制"设备清单"出厂日期的编辑（若批次已超过仓库确认，保存后自动回退至仓库确认中）
  const [isEditDateMode, setIsEditDateMode] = useState(false)
  // 展开查看现场信息的设备ID（null 表示未展开）
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null)

  useEffect(() => {
    fetchBatchData()
    fetchShippingInfo()
    fetchOperationLogs()
  }, [batchId])

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
      setReturnQuantity(result.data.batchInfo.deviceCount.toString())
      setFactoryTrackingInput(result.data.batchInfo.factoryTrackingNum || "")
      
      // 初始化出厂日期
      const dates: Record<string, Date | null> = {}
      result.data.devices.forEach((device: Device) => {
        dates[device.id] = device.manufactureDate ? new Date(device.manufactureDate) : null
      })
      setManufactureDates(dates)
    } catch (err: any) {
      console.error("获取批次数据失败:", err)
      setError(err.message || "加载失败")
    } finally {
      setLoading(false)
    }
  }

  const fetchShippingInfo = async () => {
    try {
      const response = await fetch(`/api/tickets/shipping-info/${batchId}`)
      const result = await response.json()

      if (response.ok && result.success && result.data) {
        if (result.data.shippingType) setShippingType(result.data.shippingType)
        if (result.data.returnDate) setReturnDate(new Date(result.data.returnDate))
        if (result.data.returnTrackingNum) setReturnTrackingNum(result.data.returnTrackingNum)
        if (result.data.returnQuantity) setReturnQuantity(result.data.returnQuantity.toString())
      }
    } catch (err: any) {
      console.error("获取发货信息失败:", err)
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

  // ── 保存返厂快递单号 ──────────────────────────────────────────────────────────
  const handleSaveFactoryTracking = async () => {
    if (!factoryTrackingInput.trim()) {
      toast.error("请填写返厂快递单号")
      return
    }
    setIsSavingFactoryTracking(true)
    try {
      const response = await fetch(`/api/tickets/factory-tracking/${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factoryTrackingNum: factoryTrackingInput.trim(), factoryShipDate: new Date().toISOString() }),
      })
      const result = await response.json()
      if (result.success) {
        toast.success("返厂快递单号已保存")
        await fetchBatchData()
      } else {
        toast.error(result.message || "保存失败")
      }
    } catch (err) {
      toast.error("保存失败，请重试")
    } finally {
      setIsSavingFactoryTracking(false)
    }
  }

  // ── 保存单个设备的出厂日期（返回 { success, didRevert } 信息）──
  const saveManufactureDateForDevice = async (
    deviceId: string,
    date: Date
  ): Promise<{ success: boolean; didRevert: boolean }> => {
    try {
      const response = await fetch(`/api/tickets/manufacture-date/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ manufactureDate: date.toISOString() })
      })
      const result = await response.json()
      return {
        success: !!result.success,
        didRevert: !!result.data?.didRevert,
      }
    } catch (error) {
      console.error(`保存设备 ${deviceId} 出厂日期失败:`, error)
      return { success: false, didRevert: false }
    }
  }

  // ── 【出厂日期修改】保存出厂日期并写入审计日志，若批次状态已超过仓库确认则自动回退 ──
  const handleSaveDates = async () => {
    const devicesToUpdate = devices.filter(d => manufactureDates[d.id])
    if (devicesToUpdate.length === 0) {
      toast.warning("没有需要保存的出厂日期")
      return
    }

    setIsSavingDates(true)
    try {
      const results = await Promise.all(
        devicesToUpdate.map(device =>
          saveManufactureDateForDevice(device.id, manufactureDates[device.id]!)
        )
      )
      const successCount = results.filter(r => r.success).length
      const failCount = results.length - successCount
      const didRevertAny = results.some(r => r.didRevert)

      if (successCount > 0) {
        if (didRevertAny) {
          toast.success(
            failCount > 0
              ? `出厂日期已保存 ${successCount} 台（${failCount} 台失败），批次状态已回退至仓库确认中，请重新完成确认流程`
              : `出厂日期已保存（共 ${successCount} 台），批次状态已回退至仓库确认中，请重新完成确认流程`
          )
        } else {
          toast.success(
            failCount > 0
              ? `出厂日期已保存 ${successCount} 台（${failCount} 台失败），操作已记录`
              : `出厂日期已保存（共 ${successCount} 台），操作已记录`
          )
        }
        setIsEditDateMode(false)
        await fetchBatchData()
        await fetchOperationLogs()
        // 若状态已回退至仓库确认中，刷新父页面以显示正确的流程步骤
        if (didRevertAny) {
          setTimeout(() => window.location.reload(), 1500)
        }
      } else {
        toast.error("出厂日期保存失败，请重试")
      }
    } catch (error) {
      console.error("保存出厂日期失败:", error)
      toast.error("保存失败，请重试")
    } finally {
      setIsSavingDates(false)
    }
  }

  // ── 【发货信息专用】保存发货信息（可能维持/回退至 WAREHOUSE_SHIPPING）─────────
  const handleSaveShippingInfo = async () => {
    if (shippingType === "return" && (!returnDate || !returnTrackingNum.trim())) {
      toast.error("发回客户时，发货日期和快递单号为必填项")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tickets/shipping-info/${batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingType,
          returnDate: returnDate?.toISOString(),
          returnTrackingNum: returnTrackingNum.trim(),
          returnQuantity: parseInt(returnQuantity) || batchInfo?.deviceCount || devices.length
        })
      })

      const result = await response.json()
      if (result.success) {
        toast.success(result.message || "发货信息已更新")
        setIsEditShippingMode(false)
        await fetchBatchData()
        await fetchShippingInfo()
      } else {
        toast.error(result.message || "更新失败")
      }
    } catch (error) {
      console.error("更新发货信息失败:", error)
      toast.error("更新失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── 完成发货（终态提交）────────────────────────────────────────────────────────
  const handleCompleteShipping = async () => {
    if (shippingType === "return") {
      if (!returnDate) { toast.error("请选择发货日期"); return }
      if (!returnTrackingNum.trim()) { toast.error("请填写快递单号"); return }
      if (!returnQuantity || parseInt(returnQuantity) <= 0) { toast.error("请填写发货数量"); return }
    }

    setIsSubmitting(true)
    try {
      // 先静默保存有改动的出厂日期
      const devicesToUpdate = devices.filter(d => manufactureDates[d.id])
      if (devicesToUpdate.length > 0) {
        const saves = await Promise.all(
          devicesToUpdate.map(d => saveManufactureDateForDevice(d.id, manufactureDates[d.id]!))
        )
        console.log(`[确认发货] 出厂日期已保存 ${saves.filter(r => r).length} 台`)
      }

      const response = await fetch(`/api/tickets/warehouse-shipping-batch/${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingType,
          returnDate: returnDate?.toISOString(),
          returnTrackingNum: returnTrackingNum.trim(),
          returnQuantity: parseInt(returnQuantity) || batchInfo?.deviceCount || devices.length
        }),
      })

      const result = await response.json()
      if (result.success) {
        toast.success(
          shippingType === "return"
            ? `批次设备已发回客户，共 ${batchInfo?.deviceCount || devices.length} 台`
            : `批次设备已入库，共 ${batchInfo?.deviceCount || devices.length} 台`
        )
        onCompleted?.()
      } else {
        toast.error(result.message || "操作失败")
      }
    } catch (error) {
      console.error("仓库发货失败:", error)
      toast.error("操作失败，请重试")
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

  const isCompleted = batchInfo.status === TicketStatus.COMPLETED
  const isShippingStage = batchInfo.status === TicketStatus.WAREHOUSE_SHIPPING
  // 出厂日期：任何非终态均可静默修改（不改变工单状态）
  const canEditDates = allowEdit && !isCompleted
  // 发货方式：只有当维修人员已选定最终结果（状态到达 WAREHOUSE_SHIPPING）
  // 或已完成（COMPLETED，允许后期修正）时才能编辑
  // ⚠️ 禁止在 IN_REPAIR / TECHNICIAN_REPAIRING 等中间状态下填写发货信息
  const canEditShipping = allowEdit && (isShippingStage || isCompleted)

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={onBack} variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">仓库发货处理</h1>
            <p className="text-sm text-muted-foreground">
              批次号：{batchId} | 共 {batchInfo.deviceCount} 台设备
            </p>
          </div>
        </div>
        <Badge className={isCompleted ? "bg-green-600" : "bg-orange-600"}>
          {isCompleted ? "已完成" : "待发货"}
        </Badge>
      </div>

      {/* 提示信息 */}
      <Alert className="border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <p className="font-medium mb-1">仓库发货流程说明</p>
          <p className="text-sm">
            请选择处理方式：<span className="font-semibold">发回客户</span> 或 <span className="font-semibold">产品入库</span>。完成后，批次工单将标记为"已完成"。
          </p>
        </AlertDescription>
      </Alert>

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
              <p className="font-medium text-lg text-primary">{batchInfo.deviceCount} 台</p>
            </div>
            {batchInfo.expressCompany && (
              <div>
                <p className="text-sm text-muted-foreground">寄件快递公司</p>
                <p className="font-medium">{batchInfo.expressCompany}</p>
              </div>
            )}
            {batchInfo.trackingNumber && (
              <div>
                <p className="text-sm text-muted-foreground">寄件快递单号</p>
                <p className="font-medium font-mono">{batchInfo.trackingNumber}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 设备清单（出厂日期独立编辑轨道）──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>设备清单</CardTitle>
            {/* 出厂日期编辑按钮（独立轨道，绝不影响工单状态）*/}
            {canEditDates && (
              <Button
                variant={isEditDateMode ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  if (isEditDateMode) {
                    // 取消时恢复原始日期
                    const dates: Record<string, Date | null> = {}
                    devices.forEach(d => {
                      dates[d.id] = d.manufactureDate ? new Date(d.manufactureDate) : null
                    })
                    setManufactureDates(dates)
                  }
                  setIsEditDateMode(v => !v)
                }}
              >
                {isEditDateMode ? (
                  <><X className="w-4 h-4 mr-1" />取消编辑</>
                ) : (
                  <><Pencil className="w-4 h-4 mr-1" />编辑出厂日期</>
                )}
              </Button>
            )}
          </div>
          {isEditDateMode && (
            <Alert className="mt-2 border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                <span className="font-semibold">出厂日期修改模式</span>：保存后将更新出厂日期及保修状态，操作将写入操作记录。若当前批次状态已超过仓库确认，系统将自动回退至仓库确认中。
              </AlertDescription>
            </Alert>
          )}
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
                  <TableHead>出厂日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>现场信息</TableHead>
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
                      {isEditDateMode ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "justify-start text-left font-normal min-w-[140px]",
                                !manufactureDates[device.id] && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {manufactureDates[device.id] ? (
                                format(manufactureDates[device.id]!, "yyyy-MM-dd", { locale: zhCN })
                              ) : (
                                <span className="text-muted-foreground">未填写</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={manufactureDates[device.id] || undefined}
                              onSelect={(date) =>
                                setManufactureDates(prev => ({ ...prev, [device.id]: date || null }))
                              }
                              initialFocus
                              locale={zhCN}
                              captionLayout="dropdown"
                              fromYear={2010}
                              toYear={new Date().getFullYear() + 5}
                              fixedWeeks
                              disabled={(date) => date > new Date()}
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-sm">
                          {manufactureDates[device.id] ? (
                            format(manufactureDates[device.id]!, "yyyy-MM-dd", { locale: zhCN })
                          ) : (
                            <span className="text-muted-foreground">未填写</span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {normalizeTicketStatus(device.status)
                          ? TICKET_STATUS_LABELS[normalizeTicketStatus(device.status)!]
                          : device.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedDeviceId(expandedDeviceId === device.id ? null : device.id)}
                        title="查看现场图片和故障信息"
                      >
                        {expandedDeviceId === device.id ? (
                          <>
                            <ChevronUp className="w-4 h-4 mr-1" />
                            收起
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4 mr-1" />
                            查看
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 展开的设备现场信息（只读） */}
          {expandedDeviceId && (() => {
            const device = devices.find(d => d.id === expandedDeviceId)
            if (!device) return null

            // 解析图片路径：支持 JSON 数组 或 逗号分隔字符串
            let imagePaths: string[] = []
            if (device.deviceImages) {
              try {
                const parsed = JSON.parse(device.deviceImages)
                imagePaths = Array.isArray(parsed) ? parsed : [device.deviceImages]
              } catch {
                imagePaths = device.deviceImages.split(",").map((s: string) => s.trim()).filter(Boolean)
              }
            }

            return (
              <div className="mt-4 pt-4 border-t">
                <Card className="bg-muted/30">
                  <CardHeader>
                    <CardTitle className="text-base">设备现场信息</CardTitle>
                    <CardDescription>
                      序列号：{device.deviceSerialNumber}　型号：{device.modelName || "-"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 故障描述 */}
                    {device.problem && (
                      <div>
                        <Label className="text-sm text-muted-foreground">故障描述</Label>
                        <p className="font-medium mt-1 whitespace-pre-line bg-background rounded-md p-3 border">
                          {device.problem}
                        </p>
                      </div>
                    )}

                    {/* 故障点 */}
                    {device.faultPoint && (
                      <div>
                        <Label className="text-sm text-muted-foreground">故障点</Label>
                        <p className="font-medium mt-1 bg-background rounded-md p-3 border">
                          {device.faultPoint}
                        </p>
                      </div>
                    )}

                    {/* 现场图片 */}
                    <div>
                      <Label className="text-sm text-muted-foreground mb-2 block">现场上传图片</Label>
                      {imagePaths.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {imagePaths.map((src: string, idx: number) => {
                            const normalizedSrc = normalizeImageUrl(src)
                            return (
                              <div key={idx} className="aspect-video rounded-lg overflow-hidden border border-border">
                                <img
                                  src={normalizedSrc}
                                  alt={`现场图片 ${idx + 1}`}
                                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => window.open(normalizedSrc, '_blank')}
                                  onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement
                                    if (target.dataset.fallbackApplied !== "true") {
                                      target.dataset.fallbackApplied = "true"
                                      target.src = "/placeholder.jpg"
                                    }
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="p-8 text-center border border-dashed rounded-lg">
                          <ImageOff className="w-10 h-10 mx-auto mb-2 opacity-30 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">暂无现场图片</p>
                        </div>
                      )}
                    </div>

                    {/* 若没有任何信息 */}
                    {!device.problem && !device.faultPoint && imagePaths.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-4">该设备暂无现场上传信息</p>
                    )}
                  </CardContent>
                </Card>

                {/* 维修人员处理信息 */}
                {(device.repairAction || device.finalOutcome) && (
                  <Card className="bg-blue-50/50 border-blue-200 mt-3">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-blue-800">维修处理信息</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {device.repairAction && (
                        <div>
                          <Label className="text-sm text-muted-foreground">处理方式</Label>
                          <p className="font-medium mt-1">
                            {REPAIR_ACTION_LABELS[device.repairAction as RepairAction] || device.repairAction}
                          </p>
                        </div>
                      )}
                      {device.finalOutcome && (
                        <div>
                          <Label className="text-sm text-muted-foreground">最终处置结果</Label>
                          <p className="font-medium mt-1">
                            {FINAL_OUTCOME_LABELS[device.finalOutcome as FinalOutcome] || device.finalOutcome}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })()}

          {/* 出厂日期专用保存按钮（仅在 isEditDateMode 时显示）*/}
          {isEditDateMode && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleSaveDates}
                disabled={isSavingDates}
                className="min-w-[160px]"
              >
                {isSavingDates ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    保存中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    保存出厂日期
                  </span>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 返厂快递信息（仅返厂维修场景显示）──────────────────────────────────── */}
      {(normalizeTicketStatus(batchInfo.status) === TicketStatus.PENDING_FACTORY ||
        normalizeTicketStatus(batchInfo.status) === TicketStatus.FACTORY_FINISHED ||
        batchInfo.factoryTrackingNum) && (
        <Card className="border-orange-200 bg-orange-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <Truck className="w-5 h-5" />
              返厂快递信息
            </CardTitle>
            <CardDescription>设备寄往维修工厂的快递单号</CardDescription>
          </CardHeader>
          <CardContent>
            {batchInfo.factoryTrackingNum ? (
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">返厂快递单号</p>
                  <p className="font-mono font-semibold text-lg">{batchInfo.factoryTrackingNum}</p>
                </div>
                {batchInfo.factoryShipDate && (
                  <div>
                    <p className="text-sm text-muted-foreground">寄出日期</p>
                    <p className="font-medium">{format(new Date(batchInfo.factoryShipDate), "yyyy-MM-dd", { locale: zhCN })}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  value={factoryTrackingInput}
                  onChange={(e) => setFactoryTrackingInput(e.target.value)}
                  placeholder="请输入返厂快递单号"
                  className="font-mono max-w-xs"
                />
                <Button size="sm" onClick={handleSaveFactoryTracking} disabled={isSavingFactoryTracking}>
                  {isSavingFactoryTracking ? "保存中..." : "保存"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 发货方式（发货信息独立编辑轨道）─────────────────────────────────── */}
      <Card className="border-primary/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                发货方式
              </CardTitle>
              <CardDescription className="mt-1">请选择设备的处理方式</CardDescription>
            </div>
            {/* 发货信息编辑按钮（独立轨道）*/}
            {canEditShipping && !isShippingStage && (
              <Button
                variant={isEditShippingMode ? "destructive" : "outline"}
                size="sm"
                onClick={() => setIsEditShippingMode(v => !v)}
              >
                {isEditShippingMode ? (
                  <><X className="w-4 h-4 mr-1" />取消编辑</>
                ) : (
                  <><Pencil className="w-4 h-4 mr-1" />编辑发货信息</>
                )}
              </Button>
            )}
          </div>
          {isEditShippingMode && (
            <Alert className="mt-2 border-blue-300 bg-blue-50">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                <span className="font-semibold">发货信息编辑模式</span>：修改后点击"保存发货信息"即可更新，不会进入终态。
              </AlertDescription>
            </Alert>
          )}
          {/* 锁定提示：流程未到待发货阶段时，显示原因说明 */}
          {!canEditShipping && !isShippingStage && (
            <Alert className="mt-2 border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                      <span className="font-semibold">发货信息暂不可编辑</span>：当前工单状态为"
                <span className="font-medium">{TICKET_STATUS_LABELS[normalizeTicketStatus(batchInfo.status) ?? TicketStatus.WAREHOUSE_SHIPPING] || batchInfo.status}</span>"，
                需要维修人员完成维修并选择最终处理结果（维修完成 / 报废 / 寄回）后，
                工单流转至"待发货"状态，仓库才可填写发货信息。
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 发货方式选择（首次填写 or 编辑模式下可交互）*/}
          <RadioGroup
            value={shippingType}
            onValueChange={(value) => setShippingType(value as "return" | "stock")}
            disabled={!isEditShippingMode && !isShippingStage}
          >
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-muted/30 cursor-pointer">
              <RadioGroupItem
                value="return"
                id="return"
                disabled={!isEditShippingMode && !isShippingStage}
              />
              <Label htmlFor="return" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="font-medium">发回客户</p>
                    <p className="text-sm text-muted-foreground">设备已维修完成，发回给客户</p>
                  </div>
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-muted/30 cursor-pointer">
              <RadioGroupItem
                value="stock"
                id="stock"
                disabled={!isEditShippingMode && !isShippingStage}
              />
              <Label htmlFor="stock" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="font-medium">产品入库</p>
                    <p className="text-sm text-muted-foreground">设备暂不发回，先入库存储</p>
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>

          {/* 发回客户的详细信息 */}
          {shippingType === "return" && (
            <div className="space-y-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-semibold text-green-900">发回客户信息</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="returnDate">发货日期 *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="returnDate"
                        variant="outline"
                        disabled={!isEditShippingMode && !isShippingStage}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !returnDate && "text-muted-foreground border-destructive"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {returnDate ? (
                          format(returnDate, "yyyy-MM-dd", { locale: zhCN })
                        ) : (
                          <span className="text-destructive">请选择日期</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={returnDate || undefined}
                        onSelect={(date) => setReturnDate(date || null)}
                        initialFocus
                        locale={zhCN}
                        captionLayout="dropdown"
                        fromYear={2010}
                        toYear={new Date().getFullYear() + 5}
                        fixedWeeks
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="returnQuantity">发货数量 *</Label>
                  <Input
                    id="returnQuantity"
                    type="number"
                    min="1"
                    max={batchInfo?.deviceCount || devices.length}
                    value={returnQuantity}
                    onChange={(e) => setReturnQuantity(e.target.value)}
                    placeholder="请输入发货数量"
                    disabled={!isEditShippingMode && !isShippingStage}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="returnTrackingNum">快递单号 *</Label>
                  <Input
                    id="returnTrackingNum"
                    value={returnTrackingNum}
                    onChange={(e) => setReturnTrackingNum(e.target.value)}
                    placeholder="请输入快递单号"
                    className="font-mono"
                    disabled={!isEditShippingMode && !isShippingStage}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 入库说明 */}
          {shippingType === "stock" && (
            <Alert className="border-blue-200 bg-blue-50">
              <Archive className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <p className="font-medium mb-1">产品入库</p>
                <p className="text-sm">
                  批次中的 {batchInfo?.deviceCount || devices.length} 台设备将被标记为"已入库"，不发回客户。设备将存储在仓库中，可随时查询。
                </p>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── 底部操作区 ─────────────────────────────────────────────────────────── */}
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {isEditShippingMode
                    ? "保存发货信息修改"
                    : isCompleted
                      ? "发货流程已完成"
                      : shippingType === "return"
                        ? "完成发货并结束流程"
                        : "完成入库并结束流程"
                  }
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isEditShippingMode
                    ? "保存修改后的发货信息（不改变工单终态）"
                    : shippingType === "return"
                      ? `设备将发回客户，批次工单状态将变更为"已完成"`
                      : `设备将入库存储，批次工单状态将变更为"已完成"`
                  }
                </p>
              </div>
            </div>

            {/* 发货信息保存按钮（仅在 isEditShippingMode 时）*/}
            {isEditShippingMode ? (
              <Button
                size="lg"
                onClick={handleSaveShippingInfo}
                disabled={isSubmitting || (shippingType === "return" && (!returnDate || !returnTrackingNum.trim()))}
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
                    保存发货信息
                  </span>
                )}
              </Button>
            ) : !isCompleted ? (
              /* 确认发货/入库（终态提交）*/
              <Button
                size="lg"
                onClick={handleCompleteShipping}
                disabled={isSubmitting || (shippingType === "return" && (!returnDate || !returnTrackingNum.trim()))}
                className="w-full md:w-auto min-w-[180px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    处理中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {shippingType === "return" ? "确认发货" : "确认入库"}
                  </span>
                )}
              </Button>
            ) : null}
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
                  let IconComponent = Clock
                  let iconColor = "text-primary"
                  let bgColor = "bg-primary/10"

                  if (log.type === OperationLogType.CREATED) {
                    IconComponent = FileText; iconColor = "text-blue-600"; bgColor = "bg-blue-100"
                  } else if (log.type === OperationLogType.SUBMITTED) {
                    IconComponent = Send; iconColor = "text-sky-600"; bgColor = "bg-sky-100"
                  } else if (log.type === OperationLogType.WAREHOUSE_CONFIRMED) {
                    IconComponent = Package; iconColor = "text-purple-600"; bgColor = "bg-purple-100"
                  } else if (log.type === OperationLogType.REPAIR_REPORT_GENERATED) {
                    IconComponent = ClipboardList; iconColor = "text-indigo-600"; bgColor = "bg-indigo-100"
                  } else if (log.type === OperationLogType.REPORTER_CONFIRMED) {
                    IconComponent = PenTool; iconColor = "text-pink-600"; bgColor = "bg-pink-100"
                  } else if (log.type === OperationLogType.TECHNICIAN_COMPLETED) {
                    IconComponent = CheckCircle; iconColor = "text-green-600"; bgColor = "bg-green-100"
                  } else if (log.type === OperationLogType.BUSINESS_REVIEWED) {
                    IconComponent = DollarSign; iconColor = "text-orange-600"; bgColor = "bg-orange-100"
                  } else if (log.type === OperationLogType.BUSINESS_REVIEW_SKIPPED) {
                    IconComponent = CheckCircle; iconColor = "text-slate-600"; bgColor = "bg-slate-100"
                  } else if (log.type === OperationLogType.WAREHOUSE_SHIPPED) {
                    IconComponent = Download; iconColor = "text-teal-600"; bgColor = "bg-teal-100"
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
