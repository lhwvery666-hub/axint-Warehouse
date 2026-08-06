"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Package, Calendar as CalendarIcon, CheckCircle, AlertCircle, Info, MessageSquare, Activity, ImageOff, ChevronDown, ChevronUp, Pencil, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
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
import { normalizeImageUrl } from "@/lib/storage/image-url-utils"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { toBeijingTime } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { TicketStatus, UserRole, OperationLogType, OPERATION_LOG_TYPE_LABELS, TICKET_STATUS_LABELS, normalizeTicketStatus } from "@/lib/enums"
import { TicketChat } from "@/components/TicketChat"
import { useAuth } from "@/context/auth-context"
import { sumDeviceQuantity } from "@/lib/device-quantity"
import { canEditDeviceClassification } from "@/lib/device-identity-permissions"

interface Device {
  id: string
  deviceSerialNumber: string
  modelName: string
  deviceName: string
  category: string
  subCategory: string
  faultDescription: string
  manufactureDate?: string | null
  arrivalDate?: string | null
  warrantyStatus?: string | null
  status?: string
  deviceImages?: string | null   // 现场上传的设备图片（JSON数组或逗号分隔路径）
  faultPoint?: string | null     // 故障点
  quantity?: number
}

// 可以被仓库管理员确认（填写出厂日期并推进）的状态集合
// ⚠️ 曾经的 bug：直接用原始字符串做 Set.has 比较，一旦后端返回的状态大小写/格式不完全一致
// （如历史脏数据），就会被判定为"不可确认"，导致设备在仓库确认页面显示不出来或按钮无法生效，
// 表现为工单"卡死"在待处理。修复：统一先用 normalizeTicketStatus 归一化后再比较。
const CONFIRMABLE_TICKET_STATUSES = new Set<TicketStatus>([
  TicketStatus.CREATED,
  TicketStatus.WAREHOUSE_CONFIRMING,
  TicketStatus.WAREHOUSE_CONFIRMED,
])
const CONFIRMABLE_STATUSES = {
  has: (status: string | null | undefined): boolean => {
    const normalized = normalizeTicketStatus(status || "")
    return !!normalized && CONFIRMABLE_TICKET_STATUSES.has(normalized)
  }
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

interface WarehouseBatchConfirmProps {
  batchId: string
  onBack: () => void
  onConfirmed?: () => void
  allowEdit?: boolean
}

export default function WarehouseBatchConfirm({ batchId, onBack, onConfirmed, allowEdit = true }: WarehouseBatchConfirmProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [manufactureDates, setManufactureDates] = useState<Record<string, Date | null>>({})
  const [arrivalDates, setArrivalDates] = useState<Record<string, Date | null>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  // 展开查看现场信息的设备ID（null 表示未展开）
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null)
  const [editingClassificationDevice, setEditingClassificationDevice] = useState<Device | null>(null)
  const [classificationForm, setClassificationForm] = useState({
    category: "",
    subCategory: "",
    modelName: "",
    deviceName: "",
  })
  const [isSavingClassification, setIsSavingClassification] = useState(false)

  const fetchBatchDevices = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/tickets/batch-devices/${batchId}`)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || "获取批次设备列表失败")
      }

      setBatchInfo(result.data.batchInfo)
      setDevices(result.data.devices)

      // 初始化出厂日期
      const dates: Record<string, Date | null> = {}
      result.data.devices.forEach((device: Device) => {
        dates[device.id] = device.manufactureDate ? new Date(device.manufactureDate) : null
      })
      setManufactureDates(dates)

      // 初始化到货日期：已有数据则回显，否则默认当天中午（东八区当天，避免跨日误差）
      const todayNoon = new Date()
      todayNoon.setHours(12, 0, 0, 0)
      const arrivalDatesInit: Record<string, Date | null> = {}
      result.data.devices.forEach((device: Device) => {
        arrivalDatesInit[device.id] = device.arrivalDate ? new Date(device.arrivalDate) : todayNoon
      })
      setArrivalDates(arrivalDatesInit)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "加载失败"
      console.error("获取批次设备列表失败:", err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [batchId])

  // 获取批次操作记录
  const fetchOperationLogs = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/batch-operation-logs/${batchId}`)
      const result = await response.json()

      if (response.ok && result.success) {
        setOperationLogs(result.data.operations || [])
      }
    } catch (err: unknown) {
      console.error("获取操作记录失败:", err)
    }
  }, [batchId])

  // 加载批次设备数据
  useEffect(() => {
    void fetchBatchDevices()
    void fetchOperationLogs()
  }, [fetchBatchDevices, fetchOperationLogs])

  const openClassificationEditor = (device: Device) => {
    setEditingClassificationDevice(device)
    setClassificationForm({
      category: device.category || "",
      subCategory: device.subCategory || "",
      modelName: device.modelName || "",
      deviceName: device.deviceName || "",
    })
  }

  const handleSaveClassification = async () => {
    if (!editingClassificationDevice) return

    const category = classificationForm.category.trim()
    const subCategory = classificationForm.subCategory.trim()
    const modelName = classificationForm.modelName.trim()
    const deviceName = classificationForm.deviceName.trim()
    if (!category || !subCategory || !modelName) {
      toast.error("请完整填写一级分类、二级分类和型号")
      return
    }

    setIsSavingClassification(true)
    try {
      const response = await fetch(`/api/tickets/batch-devices/${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: Number(editingClassificationDevice.id),
          updates: {
            category,
            subCategory,
            modelName,
            ...(deviceName ? { deviceName } : {}),
          },
        }),
      })
      const result = await response.json().catch(() => null) as {
        success?: boolean
        message?: string
      } | null
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "保存设备分类失败")
      }

      toast.success("设备分类和型号已完善")
      setEditingClassificationDevice(null)
      await Promise.all([fetchBatchDevices(), fetchOperationLogs()])
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : "保存设备分类失败"
      toast.error(message)
    } finally {
      setIsSavingClassification(false)
    }
  }

  // 确认批次并提交出厂日期（只提交需要确认的设备）
  const handleConfirmBatch = async () => {
    const devicesToConfirm = devices.filter(d => CONFIRMABLE_STATUSES.has(d.status || ""))
    // 验证需要确认的设备都有出厂日期和到货日期
    const missingManufacture = devicesToConfirm.filter(device => !manufactureDates[device.id])
    if (missingManufacture.length > 0) {
      toast.error(`请为所有待确认设备填写出厂日期（还有 ${sumDeviceQuantity(missingManufacture)} 台设备未填写）`)
      return
    }
    const missingArrival = devicesToConfirm.filter(device => !arrivalDates[device.id])
    if (missingArrival.length > 0) {
      toast.error(`请为所有待确认设备填写到货日期（还有 ${sumDeviceQuantity(missingArrival)} 台设备未填写）`)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tickets/warehouse-confirm-batch/${batchId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          devices: devicesToConfirm.map(device => ({
            id: device.id,
            quantity: device.quantity,
            manufactureDate: manufactureDates[device.id]?.toISOString(),
            // 时区：发送本地时间对应的 UTC ISO 字符串，服务端存 UTC，前端读取后 format 为东八区日期
            arrivalDate: arrivalDates[device.id]?.toISOString()
          }))
        }),
      })

      const result = await response.json()
      if (result.success) {
        toast.success(result.message || `批次设备已确认，共 ${sumDeviceQuantity(devicesToConfirm)} 台设备，状态已更新为"维修检查中"`)
        fetchBatchDevices()
        fetchOperationLogs()
        onConfirmed?.()
      } else {
        toast.error(result.message || "确认失败")
      }
    } catch (error) {
      console.error("确认批次失败:", error)
      toast.error("确认失败，请重试")
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
            <h1 className="text-2xl font-bold">仓库确认批次设备</h1>
            <p className="text-sm text-muted-foreground">
              批次号：{batchId} | 共 {batchInfo.deviceCount} 台设备
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={batchInfo.status === TicketStatus.WAREHOUSE_CONFIRMED ? "bg-blue-600" : "bg-orange-600"}>
            {batchInfo.status === TicketStatus.WAREHOUSE_CONFIRMED ? "已确认" : "待确认"}
          </Badge>
        </div>
      </div>

      {/* 提示信息 */}
      {batchInfo.status === TicketStatus.WAREHOUSE_CONFIRMING ? (
        <Alert className="border-orange-300 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <p className="font-medium mb-1">⚠️ 设备信息已变更，需重新确认</p>
            <p className="text-sm">
              维修人员已修改了批次中的设备信息（如序列号或型号），请重新核对设备信息并确认出厂日期，以便维修工作继续推进。
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <p className="font-medium mb-1">仓库确认流程说明</p>
            <p className="text-sm">
              请核对每台设备的分类、型号和出厂日期。现场选择“通用”的设备，可在此手动完善为准确分类；确认后维修人员将直接看到修正结果。
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
              <p className="font-medium text-lg text-primary">{batchInfo.deviceCount} 台</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 设备列表与出厂日期填写 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>设备清单及出厂日期</CardTitle>
            {(() => {
              const needConfirm = devices.filter(d => CONFIRMABLE_STATUSES.has(d.status || ""))
              const filled = sumDeviceQuantity(needConfirm.filter(d => manufactureDates[d.id]))
              const needConfirmCount = sumDeviceQuantity(needConfirm)
              return (
                <Badge variant={filled === needConfirmCount && needConfirmCount > 0 ? "default" : "secondary"}>
                  {filled} / {needConfirmCount} 待确认已填写
                </Badge>
              )
            })()}
          </div>
          <CardDescription>
            请逐台核对一级分类、二级分类、型号和出厂日期；分类修正只更新设备资料，不会提前改变工单状态
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[1500px]">
              <TableHeader>
                <TableRow>
                  <TableHead>序号</TableHead>
                  <TableHead>设备序列号</TableHead>
                  <TableHead>设备分类</TableHead>
                  <TableHead>产品型号</TableHead>
                  <TableHead>物料名称</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>故障描述</TableHead>
                  <TableHead>当前状态</TableHead>
                  <TableHead>到货日期 *</TableHead>
                  <TableHead>出厂日期 *</TableHead>
                  <TableHead>现场信息</TableHead>
                  <TableHead className="text-right">分类完善</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device, index) => {
                  const needsConfirm = CONFIRMABLE_STATUSES.has(device.status || "")
                  const normalizedStatus = normalizeTicketStatus(device.status || "")
                  const statusLabel = normalizedStatus ? (TICKET_STATUS_LABELS[normalizedStatus] || device.status) : device.status
                  return (
                    <TableRow key={device.id} className={!needsConfirm ? "bg-muted/40" : undefined}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{device.deviceSerialNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium">{device.category || "未分类"}</p>
                        <p className="text-xs text-muted-foreground">{device.subCategory || "未填写二级分类"}</p>
                      </TableCell>
                      <TableCell>{device.modelName || "-"}</TableCell>
                      <TableCell>{device.deviceName || "-"}</TableCell>
                      <TableCell>{device.quantity || 1} 台</TableCell>
                      <TableCell className="max-w-xs truncate" title={device.faultDescription}>
                        {device.faultDescription || "-"}
                      </TableCell>
                      <TableCell>
                        {needsConfirm ? (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            待确认
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200">
                            {statusLabel || "已推进"}
                          </Badge>
                        )}
                      </TableCell>
                      {/* 到货日期列 */}
                      <TableCell>
                        {needsConfirm ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "w-full justify-start text-left font-normal min-w-[140px]",
                                  !arrivalDates[device.id] && "text-muted-foreground border-destructive"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {arrivalDates[device.id] ? (
                                  format(arrivalDates[device.id]!, "yyyy-MM-dd", { locale: zhCN })
                                ) : (
                                  <span className="text-destructive">请选择日期</span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={arrivalDates[device.id] || undefined}
                                onSelect={(date) => {
                                  setArrivalDates(prev => ({
                                    ...prev,
                                    [device.id]: date || null
                                  }))
                                }}
                                initialFocus
                                locale={zhCN}
                                captionLayout="dropdown"
                                fromYear={2010}
                                toYear={new Date().getFullYear()}
                                fixedWeeks
                                disabled={(date) => date > new Date()}
                              />
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {arrivalDates[device.id] ? (
                              format(arrivalDates[device.id]!, "yyyy-MM-dd", { locale: zhCN })
                            ) : (
                              <span className="italic">—</span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      {/* 出厂日期列 */}
                      <TableCell>
                        {needsConfirm ? (
                          /* 待确认设备：允许编辑出厂日期（统一在底部确认按钮提交） */
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "w-full justify-start text-left font-normal min-w-[140px]",
                                  !manufactureDates[device.id] && "text-muted-foreground border-destructive"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {manufactureDates[device.id] ? (
                                  format(manufactureDates[device.id]!, "yyyy-MM-dd", { locale: zhCN })
                                ) : (
                                  <span className="text-destructive">请选择日期</span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={manufactureDates[device.id] || undefined}
                                onSelect={(date) => {
                                  setManufactureDates(prev => ({
                                    ...prev,
                                    [device.id]: date || null
                                  }))
                                }}
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
                          /* 已推进设备：只读展示出厂日期 */
                          <span className="text-sm text-muted-foreground">
                            {manufactureDates[device.id] ? (
                              format(manufactureDates[device.id]!, "yyyy-MM-dd", { locale: zhCN })
                            ) : (
                              <span className="italic">—</span>
                            )}
                          </span>
                        )}
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
                      <TableCell className="text-right">
                        {allowEdit && canEditDeviceClassification(user?.role, device.status) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openClassificationEditor(device)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            完善分类/型号
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">当前阶段已锁定</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
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
                    {device.faultDescription && (
                      <div>
                        <Label className="text-sm text-muted-foreground">故障描述</Label>
                        <p className="font-medium mt-1 whitespace-pre-line bg-background rounded-md p-3 border">
                          {device.faultDescription}
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
                    {!device.faultDescription && !device.faultPoint && imagePaths.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-4">该设备暂无现场上传信息</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* 确认按钮 */}
      {(() => {
        const devicesToConfirm = devices.filter(d => CONFIRMABLE_STATUSES.has(d.status || ""))
        const devicesToConfirmCount = sumDeviceQuantity(devicesToConfirm)
        const allFilled = devicesToConfirm.length > 0 && 
          devicesToConfirm.every(d => manufactureDates[d.id]) &&
          devicesToConfirm.every(d => arrivalDates[d.id])
        if (devicesToConfirm.length === 0) return null
        return (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">准备确认 {devicesToConfirmCount} 台待确认设备</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      确认后，这批设备状态将变更为"仓库已确认"，维修人员即可开始处理
                    </p>
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={handleConfirmBatch}
                  disabled={isSubmitting || !allFilled}
                  className="w-full md:w-auto min-w-[180px]"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      确认中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      确认 {devicesToConfirmCount} 台待确认设备
                    </span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })()}

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
                role: (user?.role || UserRole.ADMIN) as UserRole
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
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {operationLogs.length > 0 ? (
                operationLogs.map((log, index) => {
                  let icon = <Activity className="w-4 h-4" />;
                  let colorClass = "text-muted-foreground";

                  if (log.type === OperationLogType.CREATED) {
                    icon = <Package className="w-4 h-4" />;
                    colorClass = "text-blue-600";
                  } else if (log.type === OperationLogType.WAREHOUSE_CONFIRMED) {
                    icon = <CheckCircle className="w-4 h-4" />;
                    colorClass = "text-green-600";
                  }

                  return (
                    <div key={index} className="flex gap-3 pb-3 border-b last:border-0">
                      <div className={cn("mt-0.5", colorClass)}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{OPERATION_LOG_TYPE_LABELS[log.type as OperationLogType] || log.type}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{log.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {log.operator} · {format(toBeijingTime(log.time), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无操作记录</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(editingClassificationDevice)}
        onOpenChange={(open) => {
          if (!open && !isSavingClassification) setEditingClassificationDevice(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>完善设备分类和型号</DialogTitle>
            <DialogDescription>
              按实物铭牌手动修正当前设备。保存后，维修工程师将在后续工单中直接看到这些信息。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="warehouse-device-category">一级分类 *</Label>
              <Input
                id="warehouse-device-category"
                value={classificationForm.category}
                onChange={(event) => setClassificationForm((current) => ({
                  ...current,
                  category: event.target.value,
                }))}
                placeholder="例如：控制器"
                maxLength={200}
                disabled={isSavingClassification}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse-device-subcategory">二级分类 *</Label>
              <Input
                id="warehouse-device-subcategory"
                value={classificationForm.subCategory}
                onChange={(event) => setClassificationForm((current) => ({
                  ...current,
                  subCategory: event.target.value,
                }))}
                placeholder="请输入准确的二级分类"
                maxLength={200}
                disabled={isSavingClassification}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse-device-model">型号 *</Label>
              <Input
                id="warehouse-device-model"
                value={classificationForm.modelName}
                onChange={(event) => setClassificationForm((current) => ({
                  ...current,
                  modelName: event.target.value,
                }))}
                placeholder="请输入铭牌型号"
                maxLength={200}
                disabled={isSavingClassification}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse-device-name">产品名称</Label>
              <Input
                id="warehouse-device-name"
                value={classificationForm.deviceName}
                onChange={(event) => setClassificationForm((current) => ({
                  ...current,
                  deviceName: event.target.value,
                }))}
                placeholder="可选：填写标准产品名称"
                maxLength={200}
                disabled={isSavingClassification}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingClassificationDevice(null)}
              disabled={isSavingClassification}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSaveClassification}
              disabled={isSavingClassification}
            >
              {isSavingClassification && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存分类信息
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
