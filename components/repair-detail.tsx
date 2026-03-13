"use client"

import { useState, useEffect, useRef } from "react"
import { ArrowLeft, CalendarIcon, Clock, AlertCircle, FileText, Truck, MapPin, Camera, Calendar, ClockIcon, ShieldCheck, ShieldAlert, User, Wrench, Save, RefreshCw, FileCheck, CheckCircle, CheckCircle2, Pencil, ZoomIn, Download, Copy } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Switch } from "@/components/ui/switch"
import { format, addDays } from "date-fns"
import { zhCN } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { LOGISTICS } from "@/lib/mock-data"
import { useNotificationContext } from "@/context/NotificationContext"
import { useAuth } from "@/context/auth-context"
import WorkflowProgress from "@/components/workflow-progress"
import { calculateProgress, getCurrentStep, getNextStep, STATUS_TRANSITIONS } from "@/lib/workflow-utils"
import { UserRole, TicketStatus, normalizeTicketStatus, TERMINAL_STATUSES, WarrantyStatus, FaultCategory, RepairAction, REPAIR_ACTION_LABELS, FinalOutcome, FINAL_OUTCOME_LABELS } from "@/lib/enums"
import TicketActionBar from "@/components/ticket-action-bar"
import { normalizeImageUrl } from "@/lib/storage/image-url-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"



interface RepairDetailProps {
  taskId: string
  onBack: () => void
  inBatchMode?: boolean  // 标识是否在批次工单详情页中显示
}

export default function RepairDetail({ taskId, onBack, inBatchMode = false }: RepairDetailProps) {
  const { addNotification } = useNotificationContext();
  const { user } = useAuth();
  
  // 获取报告人头像
  const [reporterAvatar, setReporterAvatar] = useState<string>("/placeholder-user.jpg");
  const [reporterPhone, setReporterPhone] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  
  // 从 SQL Server 获取工单数据（扩展所有字段）
  const [repairData, setRepairData] = useState({
    id: taskId || "",
    status: "pending",
    // 现场人员填报区
    submitDate: new Date(),
    trackingNumberIn: "",
    senderAddress: "",
    contactInfo: "",
    projectName: "",
    category: "",
    modelName: "",
    quantity: 1,
    productSN: "",
    faultDescription: "",
    // 维修人员填写区
    materialCode: "",
    deviceName: "",
    fullSpec: "",
    faultPoint: "",
    // 管理员填写区
    isChargeable: false,
    factoryRepairDate: null as Date | null,
    factoryTrackingNum: "",
    supplierName: "",
    repairCost: null as number | null,
    clientName: "",
    isInvoiced: false,
    // 仓库管理员填写区
    receivedDate: null as Date | null,
    factoryShipDate: null as Date | null,
    returnDate: null as Date | null,
    returnQuantity: 1,
    returnTrackingNum: "",
    // 其他字段（兼容旧数据）
    deviceId: "",
    deviceModel: "",
    deviceSerialNumber: "",
    projectLocation: "",
    repairReason: "",
    reportDate: new Date(),
    expectedCompletionDate: addDays(new Date(), 3),
    expressCompany: "",
    trackingNumber: "",
    devicePhotos: [] as string[],
    damagePhotos: [] as string[],
    reporter: "",
    department: "运维部",
    contactPhone: "",
    inWarranty: undefined as boolean | undefined,
    warrantyEnd: undefined as string | undefined,
    // 取消申请相关字段
    cancelRequestStatus: null as string | null,
    cancelRequestReason: null as string | null,
    cancelRequestDate: null as Date | null,
    cancelApprovedBy: null as string | null,
    cancelApprovedDate: null as Date | null,
    // 签字报告照片
    signedReportPhoto: null as string | null,
    // 保修状态
    manufactureDate: null as string | null,
    warrantyStatus: null as string | null,
    // 批次ID（用于 TicketActionBar）
    batchId: null as string | null,
  });

  // 编辑状态（用于各工作台）
  const [repairFormData, setRepairFormData] = useState({
    materialCode: "",
    deviceName: "",
    fullSpec: "",
    faultPoint: "",
    // 维修人员需要填写收费金额（根据新的业务逻辑）
    repairCost: null as number | null,
    factoryRepairDate: null as Date | null,
    factoryTrackingNum: "",
    supplierName: "",
  })
  // 3W1H 相关状态（单体工单）
  const [warrantyStatusOverride, setWarrantyStatusOverride] = useState<WarrantyStatus | null>(null)
  const [faultCategory, setFaultCategory] = useState<FaultCategory | null>(null)
  const [repairAction, setRepairAction] = useState<RepairAction | null>(null)
  const [repairNotes, setRepairNotes] = useState("")
  /** 故障点与处理说明合并为一个输入框，提交时同时写入 faultPoint 与 repairNotes */
  const [faultAndNotesCombined, setFaultAndNotesCombined] = useState("")

  // 当维修动作选择 RMA 时，同步返厂模式开关
  useEffect(() => {
    setIsOutsourced(repairAction === RepairAction.RMA)
  }, [repairAction])
  // 返厂维修相关状态（由 repairAction 是否为 RMA 派生）
  const [isOutsourced, setIsOutsourced] = useState(false)
  const [adminFormData, setAdminFormData] = useState({
    // 管理员填写字段（含商务字段）
    repairCost: null as number | null,
    clientName: "",
    isInvoiced: false,
    isChargeable: false,
    isPaymentReceived: false,
    // 返厂物流管理字段
    factoryRepairDate: null as Date | null,
    factoryTrackingNum: "",
  })
  const [warehouseFormData, setWarehouseFormData] = useState({
    receivedDate: null as Date | null,
    factoryShipDate: null as Date | null,
    returnDate: null as Date | null,
    returnQuantity: 1,
    returnTrackingNum: "",
  })
  const [isSavingRepair, setIsSavingRepair] = useState(false)
  const [isSavingAdmin, setIsSavingAdmin] = useState(false)
  const [isSavingWarehouse, setIsSavingWarehouse] = useState(false)
  // 维修报告已提交后，是否允许重新编辑（点击"修改报告"后置为 true）
  const [isEditingRepairAfterSubmit, setIsEditingRepairAfterSubmit] = useState(false)
  const [isLoadingFullSpec, setIsLoadingFullSpec] = useState(false)

  // 补录 SN 相关状态
  const [isSupplementSNDialogOpen, setIsSupplementSNDialogOpen] = useState(false)
  const [newSerialNumber, setNewSerialNumber] = useState("")
  const [snValidationError, setSnValidationError] = useState("")
  const [isValidatingSN, setIsValidatingSN] = useState(false)
  const [isSubmittingSN, setIsSubmittingSN] = useState(false)
  const validationTimerRef = useRef<NodeJS.Timeout | null>(null)

  // reloadCounter：自增触发 useEffect 重新执行 loadRepairData，替代直接调用内部函数
  const [reloadCounter, setReloadCounter] = useState(0)
  // 暴露给 TicketActionBar onActionSuccess 等外部使用的刷新函数
  const loadTicketData = () => setReloadCounter(c => c + 1)

  /** 对现场人员隐藏 RMA（返厂维修）标签，显示为"维修"；其他角色原样展示 */
  const getDisplayRepairAction = (action: RepairAction | string | null | undefined): string => {
    if (!action) return "—"
    if (user?.role === UserRole.REPORTER && action === RepairAction.RMA) return "维修"
    return REPAIR_ACTION_LABELS[action as RepairAction] ?? action
  }

  // 从后端加载工单数据（禁用缓存，确保获取到最新状态）
  useEffect(() => {
    const loadRepairData = async () => {
      if (!taskId) return;
      
      setIsLoading(true);
      try {
        const response = await fetch(`/api/tickets/${taskId}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const result = await response.json();
          console.log('📦 API返回的完整数据:', result);
          if (result.success && result.data) {
            const ticket = result.data as {
              id: string
              status: string
              deviceSerialNumber?: string
              productSN?: string
              deviceName?: string
              deviceModel?: string
              projectLocation?: string
              problem?: string
              reportedAt?: string
              courierCompany?: string
              trackingNumber?: string
              reportedBy?: string
              reporterPhone?: string
              deviceImages?: string
              damageImages?: string
              expectedCompletionDate?: string
              delayReason?: string
              // 新字段
              submitDate?: string
              trackingNumberIn?: string
              senderAddress?: string
              contactInfo?: string
              projectName?: string
              category?: string
              modelName?: string
              quantity?: number
              faultDescription?: string
              materialCode?: string
              fullSpec?: string
              faultPoint?: string
              isChargeable?: boolean
              factoryRepairDate?: string
              factoryTrackingNum?: string
              supplierName?: string
              repairCost?: number
              clientName?: string
              isInvoiced?: boolean
              receivedDate?: string
              factoryShipDate?: string
              returnDate?: string
              returnQuantity?: number
              returnTrackingNum?: string
              // 取消申请相关字段
              cancelRequestStatus?: string | null
              cancelRequestReason?: string | null
              cancelRequestDate?: string | null
              cancelApprovedBy?: string | null
              cancelApprovedDate?: string | null
              // 签字报告照片
              signedReportPhoto?: string | null
              // 保修状态
              manufactureDate?: string | null
              warrantyStatus?: string | null
              // 3W1H 相关字段
              warrantyStatusOverride?: string | null
              faultCategory?: string | null
              repairAction?: string | null
              repairNotes?: string | null
            };

            // 图片字段：后端以 JSON 字符串(NVARCHAR(MAX)) 存储，这里解析为字符串数组
            let devicePhotosFromDb: string[] = []
            let damagePhotosFromDb: string[] = []

            if (ticket.deviceImages) {
              try {
                const parsed = JSON.parse(ticket.deviceImages)
                if (Array.isArray(parsed)) {
                  devicePhotosFromDb = parsed.filter((p) => typeof p === "string")
                } else if (typeof parsed === "string") {
                  devicePhotosFromDb = [parsed]
                }
              } catch {
                // 如果不是合法 JSON，当成单张图片字符串处理
                devicePhotosFromDb = [ticket.deviceImages]
              }
            }

            if (ticket.damageImages) {
              try {
                const parsed = JSON.parse(ticket.damageImages)
                if (Array.isArray(parsed)) {
                  damagePhotosFromDb = parsed.filter((p) => typeof p === "string")
                } else if (typeof parsed === "string") {
                  damagePhotosFromDb = [parsed]
                }
              } catch {
                damagePhotosFromDb = [ticket.damageImages]
              }
            }
            // 状态映射：数据库中的状态转换为前端状态
            const dbStatus = ticket.status || "Created"
            
            // 使用枚举进行状态规范化
            const normalizedStatus = normalizeTicketStatus(dbStatus || "")
            
            // ⚠️ 状态映射规则：直接透传所有已知状态，不做合并！
            // 特殊处理：现场人员看到 PENDING_FACTORY 时显示为 IN_REPAIR（隐藏返厂状态）
            let mappedStatus: string = normalizedStatus ?? TicketStatus.CREATED
            if (normalizedStatus === TicketStatus.PENDING_FACTORY && user?.role === UserRole.REPORTER) {
              mappedStatus = TicketStatus.IN_REPAIR  // 现场人员看到"维修检查中"，而不是"待返厂"
            }
            
            console.log("状态映射:", { 
              原始状态: dbStatus, 
              规范化后: normalizedStatus, 
              映射结果: mappedStatus 
            })
            
            // 如果后端返回了延期信息，使用后端的预计完成时间和原因
            const expectedCompletionDateFromApi =
              ticket.expectedCompletionDate
                ? new Date(ticket.expectedCompletionDate)
                : addDays(new Date(), 3)

            // 解析日期字段
            const parseDate = (dateStr: string | undefined) => dateStr ? new Date(dateStr) : null
            
            // 构建联系人信息（从旧字段组合）
            const contactInfoFromOld = ticket.reportedBy && ticket.reporterPhone 
              ? `${ticket.reportedBy} ${ticket.reporterPhone}`.trim()
              : ticket.reportedBy || ticket.reporterPhone || ""
            
            console.log("📦 API返回的ticket数据:", ticket);
            console.log("🔍 关键字段检查:", {
              senderAddress: ticket.senderAddress,
              contactInfo: ticket.contactInfo,
              projectName: ticket.projectName,
              category: ticket.category,
              modelName: ticket.modelName,
              faultDescription: ticket.faultDescription,
              problem: ticket.problem
            });
            
            const newRepairData = {
              id: ticket.id || taskId,
              status: mappedStatus,
              // 现场人员填报区（优先使用新字段，如果没有则从旧字段映射）
              submitDate: parseDate(ticket.submitDate) || (ticket.reportedAt ? new Date(ticket.reportedAt) : new Date()),
              trackingNumberIn: ticket.trackingNumberIn || ticket.trackingNumber || "", // 发出快递单号：优先用新字段，否则用旧字段
              senderAddress: ticket.senderAddress || "", // 寄件人地址（暂时没有旧字段映射）
              contactInfo: ticket.contactInfo || contactInfoFromOld, // 联系人及电话：优先用新字段，否则从报告人和电话组合
              projectName: ticket.projectName || ticket.projectLocation || "", // 项目/客户名称：优先用新字段，否则用项目地点
              category: ticket.category || "", // 产品名称/大类
              modelName: ticket.modelName || ticket.deviceModel || "",
              quantity: ticket.quantity || 1,
              productSN: ticket.productSN || ticket.deviceSerialNumber || "",
              faultDescription: ticket.faultDescription || ticket.problem || "",
              // 维修人员填写区
              materialCode: ticket.materialCode || "",
              deviceName: ticket.deviceName || "",
              fullSpec: ticket.fullSpec || "",
              faultPoint: ticket.faultPoint || "",
              // 管理员填写区
              isChargeable: ticket.isChargeable || false,
              factoryRepairDate: parseDate(ticket.factoryRepairDate),
              factoryTrackingNum: ticket.factoryTrackingNum || "",
              supplierName: ticket.supplierName || "",
              repairCost: ticket.repairCost || null,
              clientName: ticket.clientName || "",
              isInvoiced: ticket.isInvoiced || false,
              // 仓库管理员填写区
              receivedDate: parseDate(ticket.receivedDate),
              factoryShipDate: parseDate(ticket.factoryShipDate),
              returnDate: parseDate(ticket.returnDate),
              returnQuantity: ticket.returnQuantity || 1,
              returnTrackingNum: ticket.returnTrackingNum || "",
              // 兼容旧字段
              deviceId: ticket.deviceSerialNumber || "",
              deviceModel: ticket.deviceModel || "",
              deviceSerialNumber: ticket.deviceSerialNumber || "",
              projectLocation: ticket.projectLocation || "",
              repairReason: ticket.problem || "",
              reportDate: ticket.reportedAt ? new Date(ticket.reportedAt) : new Date(),
              expectedCompletionDate: expectedCompletionDateFromApi,
              expressCompany: ticket.courierCompany || "",
              trackingNumber: ticket.trackingNumber || "",
              devicePhotos: devicePhotosFromDb,
              damagePhotos: damagePhotosFromDb,
              reporter: ticket.reportedBy || "",
              department: "运维部",
              contactPhone: ticket.reporterPhone || "",
              inWarranty: undefined,
              warrantyEnd: undefined,
              // 取消申请相关字段image.pngimage.pngimage.png
              cancelRequestStatus: ticket.cancelRequestStatus || null,
              cancelRequestReason: ticket.cancelRequestReason || null,
              cancelRequestDate: parseDate(ticket.cancelRequestDate ?? undefined),
              cancelApprovedBy: ticket.cancelApprovedBy || null,
              cancelApprovedDate: parseDate(ticket.cancelApprovedDate ?? undefined),
              // 签字报告照片
              signedReportPhoto: ticket.signedReportPhoto || null,
              // 保修状态
              manufactureDate: ticket.manufactureDate || null,
              warrantyStatus: ticket.warrantyStatus || null,
              // 批次ID（用于 TicketActionBar）
              batchId: (ticket as any).batchId || null,
            }
            
            setRepairData(newRepairData)
            
            // 初始化 3W1H 编辑状态（如果后端已有历史值）
            setWarrantyStatusOverride(
              (ticket.warrantyStatusOverride as WarrantyStatus | null) || null
            )
            setFaultCategory(
              (ticket.faultCategory as FaultCategory | null) || null
            )
            setRepairAction(
              (ticket.repairAction as RepairAction | null) || null
            )
            setRepairNotes(ticket.repairNotes || "")
            {
              const fault = newRepairData.faultPoint || ""
              const notes = ticket.repairNotes || ""
              // 去重：若两者完全相同（之前保存时把同一内容写入了两个字段），只取其中一个，避免套娃拼接
              const combined =
                fault === notes
                  ? fault
                  : [fault, notes].filter(Boolean).join("\n\n")
              setFaultAndNotesCombined(combined)
            }

            // 初始化编辑表单数据（根据新的业务逻辑）
            setRepairFormData({
              materialCode: newRepairData.materialCode,
              deviceName: newRepairData.deviceName,
              fullSpec: newRepairData.fullSpec,
              faultPoint: newRepairData.faultPoint,
              // 维修人员填写收费金额（根据新的业务逻辑）
              repairCost: newRepairData.repairCost,
              factoryRepairDate: newRepairData.factoryRepairDate,
              factoryTrackingNum: newRepairData.factoryTrackingNum,
              supplierName: newRepairData.supplierName,
            })
            setAdminFormData({
              // 管理员填写字段（根据新的业务逻辑）
              repairCost: newRepairData.repairCost,
              isChargeable: newRepairData.isChargeable || false,
              isPaymentReceived: false, // 默认否，需要从数据库获取
              clientName: newRepairData.clientName,
              isInvoiced: newRepairData.isInvoiced,
              // 返厂物流管理字段
              factoryRepairDate: newRepairData.factoryRepairDate,
              factoryTrackingNum: newRepairData.factoryTrackingNum,
            })
            setWarehouseFormData({
              receivedDate: newRepairData.receivedDate,
              factoryShipDate: newRepairData.factoryShipDate,
              returnDate: newRepairData.returnDate,
              returnQuantity: newRepairData.returnQuantity,
              returnTrackingNum: newRepairData.returnTrackingNum,
            })

            // 从后端填充延期原因和报告人电话，用于展示
            if (ticket.delayReason) {
              setDelayReason(ticket.delayReason)
            }

            if (ticket.reporterPhone) {
              setReporterPhone(ticket.reporterPhone)
            } else {
              setReporterPhone("")
            }

            // 自动从数据库获取物料信息(如果有productSN但物料信息为空)
            const hasProductSN = ticket.productSN && 
                                 typeof ticket.productSN === 'string' && 
                                 ticket.productSN !== "PENDING" && 
                                 ticket.productSN.trim() !== ""
            const needsAutoFill = !ticket.materialCode || !ticket.deviceName || !ticket.fullSpec
            
            if (hasProductSN && needsAutoFill) {
              console.log('🔄 自动从数据库获取物料信息, ProductSN:', ticket.productSN)
              try {
                const deviceResponse = await fetch(`/api/device/check?sn=${encodeURIComponent(ticket.productSN ?? "")}`)
                const deviceResult = await deviceResponse.json()
                
                if (deviceResult.exists && deviceResult.data) {
                  const updates: any = {}
                  
                  // 填充物料代码
                  if (!ticket.materialCode && deviceResult.data.materialCode) {
                    updates.materialCode = deviceResult.data.materialCode
                  }
                  
                  // 填充物料名称(标准名)
                  if (!ticket.deviceName && deviceResult.data.deviceName) {
                    updates.deviceName = deviceResult.data.deviceName
                  }
                  
                  // 填充规格型号
                  if (!ticket.fullSpec) {
                    if (deviceResult.data.fullSpec) {
                      updates.fullSpec = deviceResult.data.fullSpec
                    } else if (deviceResult.data.modelName) {
                      updates.fullSpec = deviceResult.data.modelName
                    }
                  }
                  
                  if (Object.keys(updates).length > 0) {
                    console.log('✅ 自动填充物料信息成功:', updates)
                    // 更新 repairFormData
                    setRepairFormData(prev => ({
                      ...prev,
                      ...updates
                    }))
                  }
                }
              } catch (autoFillError) {
                console.error('⚠️ 自动获取物料信息失败:', autoFillError)
                // 失败不影响主流程，继续加载
              }
            }
          }
        }
      } catch (error) {
        console.error("加载工单数据失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadRepairData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, reloadCounter]);
  
  // 从 user context 获取报告人的头像（电话现在来自工单的报告人信息）
  useEffect(() => {
    if (user) {
      setReporterAvatar(user.avatar || "/placeholder-user.jpg");
    } else {
      // 如果不是当前登录用户，使用默认头像
      setReporterAvatar("/placeholder-user.jpg");
    }
  }, [user]);

  // 加载当前设备已保存的 finalOutcome（TECHNICIAN_REPAIRING 阶段）
  useEffect(() => {
    const ns = normalizeTicketStatus(repairData.status || "")
    if (ns !== TicketStatus.TECHNICIAN_REPAIRING || !taskId) return
    fetch(`/api/tickets/${taskId}/final-outcome`)
      .then(r => r.json())
      .then(result => {
        if (result.success && result.data?.finalOutcome) {
          setFinalOutcome(result.data.finalOutcome)
        }
      })
      .catch(() => { /* 非致命，忽略 */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, repairData.status]);
  
  // 判断是否需要补录 SN（ProductSN 为 "PENDING" 或 NULL 或空字符串）
  // 特殊情况：最终维修状态（COMPLETED, UNREPAIRABLE, SCRAPPED）下，序列号可以为空，不显示"待补录"
  const normalizedStatus = normalizeTicketStatus(repairData.status || "")
  const isTerminalStatus = normalizedStatus ? TERMINAL_STATUSES.includes(normalizedStatus) : false
  
  const needsSupplementSN = !isTerminalStatus && (
    !repairData.productSN || 
    (typeof repairData.productSN === 'string' && repairData.productSN.trim() === "") || 
    (typeof repairData.productSN === 'string' && repairData.productSN.toUpperCase() === "PENDING") ||
    (typeof repairData.deviceSerialNumber === 'string' && repairData.deviceSerialNumber.toUpperCase() === "PENDING")
  )

  // 处理补录 SN
  const handleSupplementSN = async () => {
    if (!newSerialNumber.trim()) {
      setSnValidationError("请输入设备序列号")
      return
    }

    setIsSubmittingSN(true)
    setSnValidationError("")

    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'supplementSN',
          id: taskId,
          newSerialNumber: newSerialNumber.trim(),
        }),
      })

      const result = await response.json()
      if (result.success) {
        setIsSupplementSNDialogOpen(false)
        setNewSerialNumber("")
        setSnValidationError("")
        // 刷新页面数据
        window.location.reload()
      } else {
        setSnValidationError(result.message || "补录序列号失败")
      }
    } catch (error) {
      console.error("补录序列号失败:", error)
      setSnValidationError("补录序列号失败，请重试")
    } finally {
      setIsSubmittingSN(false)
    }
  }

  // 验证序列号（实时检查，带防抖）
  useEffect(() => {
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current)
    }

    if (!newSerialNumber.trim()) {
      setSnValidationError("")
      return
    }

    validationTimerRef.current = setTimeout(async () => {
      setIsValidatingSN(true)
      setSnValidationError("")

      try {
        const response = await fetch(`/api/device/check?sn=${encodeURIComponent(newSerialNumber.trim())}`)
        const result = await response.json()

        if (result.exists) {
          setSnValidationError("")
        } else {
          setSnValidationError("设备序列号不存在于设备档案中，请先录入设备信息")
        }
      } catch (error) {
        console.error("验证序列号失败:", error)
        setSnValidationError("验证序列号失败，请重试")
      } finally {
        setIsValidatingSN(false)
      }
    }, 500)

    return () => {
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current)
      }
    }
  }, [newSerialNumber])

  // 从数据库自动获取规格型号
  const handleAutoFillFullSpec = async () => {
    if (!repairData.productSN || repairData.productSN === "PENDING") {
      alert("请先补录产品序列号")
      return
    }

    setIsLoadingFullSpec(true)
    try {
      const response = await fetch(`/api/device/check?sn=${encodeURIComponent(repairData.productSN)}`)
      const result = await response.json()
      
      if (result.exists && result.data) {
        const updates: any = {}
        
        // 填充规格型号（优先使用 fullSpec，如果没有则使用 modelName）
        if (result.data.fullSpec) {
          updates.fullSpec = result.data.fullSpec
        } else if (result.data.modelName) {
          updates.fullSpec = result.data.modelName
        }
        
        // 同时自动填充物料代码和物料名称（仅在当前为空时填充，允许手动输入）
        if (!repairFormData.materialCode && result.data.materialCode) {
          updates.materialCode = result.data.materialCode
        }
        if (!repairFormData.deviceName && result.data.deviceName) {
          updates.deviceName = result.data.deviceName
        }
        
        if (Object.keys(updates).length > 0) {
          setRepairFormData({
            ...repairFormData,
            ...updates,
          })
          alert("已从数据库自动填充信息")
        } else {
          alert("未找到该序列号对应的信息，请手动输入")
        }
      } else {
        alert("未找到该序列号对应的信息，请手动输入")
      }
    } catch (error) {
      console.error("获取规格型号失败:", error)
      alert("获取信息失败，请手动输入或重试")
    } finally {
      setIsLoadingFullSpec(false)
    }
  }

  // 检查是否为复检模式（状态为 Factory_Finished）
  const isRecheckMode = repairData.status === "Factory_Finished" || repairData.status === "factory_finished"
  
  // 根据维修动作自动推导是否为返厂模式（RMA）
  useEffect(() => {
    setIsOutsourced(repairAction === RepairAction.RMA)
  }, [repairAction])
  
  // 保存维修工作台数据
  const handleSaveRepair = async () => {
    // 如果是复检模式，需要验证故障点
    if (isRecheckMode && !faultAndNotesCombined.trim()) {
      alert("复检模式需要填写故障点与处理说明")
      return
    }
    
    setIsSavingRepair(true)
    try {
      const requestBody: Record<string, unknown> = {}
      
      // ✅ 新版 RMA 流程（2026-03 更新）：
      // 返厂维修（RMA）现在与普通维修走完全相同的流程：
      //   1. 维修人员勾选"返厂维修"后，直接填写维修报告（供应商、预估费用、出厂快递单号等）
      //   2. 保存不改变状态（仍在 IN_REPAIR），不再设置 PENDING_FACTORY
      //   3. 后续：发送报告 → 现场签字 → 技术员选最终处理结果 → 仓库发货
      //   4. 对现场人员隐藏 RMA 标签，显示为"维修"（信息隔离保持不变）
      if (isOutsourced) {
        // RMA 模式：保存所有字段，但【不改变状态】，流程继续走正常维修路径
        requestBody.supplierName       = repairFormData.supplierName || null
        requestBody.factoryTrackingNum = repairFormData.factoryTrackingNum || null
        requestBody.factoryRepairDate  = repairFormData.factoryRepairDate?.toISOString() || null
        requestBody.repairCost         = repairFormData.repairCost ?? null
        requestBody.materialCode       = repairFormData.materialCode || null
        requestBody.deviceName         = repairFormData.deviceName   || null
        requestBody.fullSpec           = repairFormData.fullSpec      || null
        requestBody.faultPoint         = faultAndNotesCombined.trim() || null
        // ✅ 不再设置 requestBody.status = PENDING_FACTORY
      } else if (isRecheckMode) {
        // 复检模式：填写故障点后流转到 Admin_Review
        requestBody.faultPoint = faultAndNotesCombined
        requestBody.materialCode = repairFormData.materialCode
        requestBody.deviceName = repairFormData.deviceName
        requestBody.fullSpec = repairFormData.fullSpec
        // 状态会自动流转到 Admin_Review（通过后端逻辑）
      } else {
        // 正常维修模式
        requestBody.materialCode = repairFormData.materialCode
        requestBody.deviceName = repairFormData.deviceName
        requestBody.fullSpec = repairFormData.fullSpec
        requestBody.faultPoint = faultAndNotesCombined
        // 维修人员填写收费金额（根据业务逻辑：质保期内填0，过保填写金额）
        requestBody.repairCost = repairFormData.repairCost || 0
        requestBody.factoryRepairDate = repairFormData.factoryRepairDate?.toISOString()
        requestBody.factoryTrackingNum = repairFormData.factoryTrackingNum
        requestBody.supplierName = repairFormData.supplierName
        
        // ⚠️ 回退逻辑（和仓库确认的 SN 变更回退机制相同）：
        // 如果维修报告已经提交（状态为 Pending_Reporter_Confirm），现场人员尚未签字，
        // 此时维修人员修改了报告内容 → 自动回退到 In_Repair，
        // 需要重新通过工作流操作栏发起现场确认流程。
        if (isEditingRepairAfterSubmit &&
            normalizeTicketStatus(repairData.status || "") === TicketStatus.PENDING_REPORTER_CONFIRM) {
          requestBody.status = TicketStatus.IN_REPAIR
        }
        // 其他情况不自动流转状态：维修人员填写完报告后需通过"工作流操作栏"手动发送
      }

      // 无论哪种模式，追加 3W1H 相关字段（空值传 null）；故障点与处理说明使用同一合并内容
      requestBody.warrantyStatusOverride = warrantyStatusOverride ?? null
      requestBody.faultCategory = faultCategory ?? null
      requestBody.repairAction = repairAction ?? null
      requestBody.repairNotes = faultAndNotesCombined.trim() || null
      
      const response = await fetch(`/api/tickets/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()
      if (result.success) {
        // 更新本地数据
        setRepairData({
          ...repairData,
          ...requestBody,
          // ✅ RMA 不再改变状态；仅复检模式（兼容旧 Factory_Finished 工单）才流转到 Admin_Review
          status: isRecheckMode ? TicketStatus.ADMIN_REVIEW : repairData.status,
        })
        // 报告修改保存后退出编辑模式，回到只读"已提交"状态
        setIsEditingRepairAfterSubmit(false)
        alert(isRecheckMode ? "复检完成，工单已流转至商务处理" : "维修记录保存成功")
        // 刷新数据
        window.location.reload()
      } else {
        alert(result.message || "保存失败")
      }
    } catch (error) {
      console.error("保存维修记录失败:", error)
      alert("保存失败，请重试")
    } finally {
      setIsSavingRepair(false)
    }
  }

  // 维修报告相关函数已移除（维修报告应该在工单总览页面操作，不在单个设备详情）

  // 保存返厂物流信息
  const handleSaveFactoryLogistics = async () => {
    setIsSavingAdmin(true)
    try {
      const response = await fetch(`/api/tickets/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          factoryRepairDate: adminFormData.factoryRepairDate?.toISOString(),
          factoryTrackingNum: adminFormData.factoryTrackingNum,
        }),
      })

      const result = await response.json()
      if (result.success) {
        setRepairData({
          ...repairData,
          factoryRepairDate: adminFormData.factoryRepairDate,
          factoryTrackingNum: adminFormData.factoryTrackingNum,
        })
        alert("返厂物流信息保存成功")
      } else {
        alert(result.message || "保存失败")
      }
    } catch (error) {
      console.error("保存返厂物流信息失败:", error)
      alert("保存失败，请重试")
    } finally {
      setIsSavingAdmin(false)
    }
  }

  // 确认收到原厂寄回设备
  const handleConfirmFactoryReceived = async () => {
    if (!confirm("确认收到原厂寄回的设备？此操作将通知维修人员进行复检。")) {
      return
    }
    
    setIsSavingAdmin(true)
    try {
      const response = await fetch(`/api/tickets/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: "Factory_Finished",
        }),
      })

      const result = await response.json()
      if (result.success) {
        setRepairData({
          ...repairData,
          status: "Factory_Finished",
        })
        alert("已确认收到原厂寄回设备，已通知维修人员复检")
        window.location.reload()
      } else {
        alert(result.message || "操作失败")
      }
    } catch (error) {
      console.error("确认收到设备失败:", error)
      alert("操作失败，请重试")
    } finally {
      setIsSavingAdmin(false)
    }
  }

  // 保存管理员工作台数据
  const handleSaveAdmin = async () => {
    setIsSavingAdmin(true)
    try {
      const response = await fetch(`/api/tickets/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // 管理员只填写这三个字段（根据Excel表格）
          repairCost: adminFormData.repairCost,
          clientName: adminFormData.clientName,
          isInvoiced: adminFormData.isInvoiced,
        }),
      })

      const result = await response.json()
      if (result.success) {
        setRepairData({
          ...repairData,
          repairCost: adminFormData.repairCost,
          clientName: adminFormData.clientName,
          isInvoiced: adminFormData.isInvoiced,
        })
        alert("商务信息更新成功")
      } else {
        alert(result.message || "更新失败")
      }
    } catch (error) {
      console.error("更新商务信息失败:", error)
      alert("更新失败，请重试")
    } finally {
      setIsSavingAdmin(false)
    }
  }

  // 保存仓库管理员工作台数据
  const handleSaveWarehouse = async () => {
    setIsSavingWarehouse(true)
    try {
      const response = await fetch(`/api/tickets/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receivedDate: warehouseFormData.receivedDate?.toISOString(),
          factoryShipDate: warehouseFormData.factoryShipDate?.toISOString(),
          returnDate: warehouseFormData.returnDate?.toISOString(),
          returnQuantity: warehouseFormData.returnQuantity,
          returnTrackingNum: warehouseFormData.returnTrackingNum,
        }),
      })

      const result = await response.json()
      if (result.success) {
        setRepairData({
          ...repairData,
          receivedDate: warehouseFormData.receivedDate,
          factoryShipDate: warehouseFormData.factoryShipDate,
          returnDate: warehouseFormData.returnDate,
          returnQuantity: warehouseFormData.returnQuantity,
          returnTrackingNum: warehouseFormData.returnTrackingNum,
        })
        alert("发货信息保存成功")
        // 如果状态自动流转为已完成，刷新数据
        if (result.data?.statusChanged && result.data?.newStatus === TicketStatus.COMPLETED) {
          window.location.reload()
        }
      } else {
        alert(result.message || "保存失败")
      }
    } catch (error) {
      console.error("保存发货信息失败:", error)
      alert("保存失败，请重试")
    } finally {
      setIsSavingWarehouse(false)
    }
  }
  
  // 处理维修完成按钮点击（跃迁至待仓库发货，走完整商务→仓库闭环）
  const handleCompleteRepair = async () => {
    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'Warehouse_Shipping', id: taskId }),
      });

      const result = await response.json();
      if (result.success) {
        setRepairData({...repairData, status: "completed"});
        
        // 发送通知给现场报告人员
        if (repairData.reporter) {
          addNotification({
            type: "repair_completed",
            title: "维修已完成",
            message: `您报修的设备"${repairData.deviceName || repairData.deviceModel}"维修已完成`,
            repairId: taskId,
            deviceName: repairData.deviceName,
            deviceModel: repairData.deviceModel,
            status: "completed",
            recipient: repairData.reporter
          });
        }
        
        // 刷新数据
        window.location.reload();
      } else {
        alert(result.message || "更新工单状态失败");
      }
    } catch (error) {
      console.error("更新工单状态失败:", error);
      alert("更新工单状态失败，请重试");
    }
  }
  
  // 处理无法维修按钮点击
  const handleUnrepairable = async () => {
    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'unrepairable', id: taskId }),
      });

      const result = await response.json();
      if (result.success) {
        setRepairData({...repairData, status: "unrepairable"});
        
        // 发送通知给现场报告人员
        if (repairData.reporter) {
          addNotification({
            type: "repair_unrepairable",
            title: "设备无法维修",
            message: `您报修的设备"${repairData.deviceName || repairData.deviceModel}"经检查无法维修，需要更换设备`,
            repairId: taskId,
            deviceName: repairData.deviceName,
            deviceModel: repairData.deviceModel,
            status: "unrepairable",
            recipient: repairData.reporter
          });
        }
        
        // 刷新数据
        window.location.reload();
      } else {
        alert(result.message || "更新工单状态失败");
      }
    } catch (error) {
      console.error("更新工单状态失败:", error);
      alert("更新工单状态失败，请重试");
    }
  }

  // 判定报废
  const handleScrapped = async () => {
    if (!scrappedReason.trim() && !window.confirm("未填写报废原因，确定要判定为报废吗？")) {
      return
    }

    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: 'Scrapped',
          id: taskId,
          scrappedReason: scrappedReason.trim() || undefined
        }),
      })

      const result = await response.json()
      if (result.success) {
        setIsScrappedDialogOpen(false)
        setScrappedReason("")
        setRepairData({...repairData, status: "Scrapped"})
        addNotification({
          type: "system",
          title: "工单已报废",
          message: `工单 ${taskId} 已被判定为报废`,
          repairId: taskId,
          recipient: user?.realName || "系统",
        })
        window.location.reload()
      } else {
        alert(result.message || "更新工单状态失败")
      }
    } catch (error) {
      console.error("更新工单状态失败:", error)
      alert("更新工单状态失败，请重试")
    }
  }

  // ── 保存设备最终处理结果（TECHNICIAN_REPAIRING 阶段，不改变状态）──────────────────
  const handleSaveFinalOutcome = async () => {
    if (!finalOutcome) {
      alert("请先选择处理结果")
      return
    }
    setIsSavingFinalOutcome(true)
    try {
      const response = await fetch(`/api/tickets/${taskId}/final-outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalOutcome }),
      })
      const result = await response.json()
      if (result.success) {
        alert("处理结果已保存！请返回工单总览，确认所有设备均已选择后再提交。")
      } else {
        alert("保存失败：" + (result.message || "未知错误"))
      }
    } catch (error) {
      console.error("保存处理结果失败:", error)
      alert("保存失败，请重试")
    } finally {
      setIsSavingFinalOutcome(false)
    }
  }

  // 拒修退回
  const handleReturnUnrepaired = async () => {
    if (!window.confirm("确定要将此工单标记为\"客户拒修/原样退回\"吗？")) {
      return
    }

    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: 'Return_Unrepaired',
          id: taskId
        }),
      })

      const result = await response.json()
      if (result.success) {
        setRepairData({...repairData, status: "Return_Unrepaired"})
        addNotification({
          type: "system",
          title: "工单已标记为拒修退回",
          message: `工单 ${taskId} 已标记为拒修退回，仓库将处理发货`,
          repairId: taskId,
          recipient: user?.realName || "系统",
        })
        window.location.reload()
      } else {
        alert(result.message || "更新工单状态失败")
      }
    } catch (error) {
      console.error("更新工单状态失败:", error)
      alert("更新工单状态失败，请重试")
    }
  }

  // 现场人员申请取消工单
  const handleRequestCancel = async () => {
    if (!cancelRequestReason.trim()) {
      alert("请填写取消原因")
      return
    }

    setIsSubmittingCancelRequest(true)
    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'request_cancel',
          id: taskId,
          cancelRequestReason: cancelRequestReason.trim()
        }),
      })

      const result = await response.json()
      if (result.success) {
        setIsCancelRequestDialogOpen(false)
        setCancelRequestReason("")
        setRepairData({
          ...repairData, 
          cancelRequestStatus: "Pending",
          cancelRequestReason: cancelRequestReason.trim(),
          cancelRequestDate: new Date()
        })
        addNotification({
          type: "system",
          title: "取消申请已提交",
          message: `您的取消申请已提交，等待商务人员审批`,
          repairId: taskId,
          recipient: user?.realName || "系统",
        })
        window.location.reload()
      } else {
        alert(result.message || "提交取消申请失败")
      }
    } catch (error) {
      console.error("提交取消申请失败:", error)
      alert("提交取消申请失败，请重试")
    } finally {
      setIsSubmittingCancelRequest(false)
    }
  }

  // 商务/管理员审批取消申请
  const handleApproveCancelRequest = async (approve: boolean) => {
    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: approve ? 'approve_cancel' : 'reject_cancel',
          id: taskId
        }),
      })

      const result = await response.json()
      if (result.success) {
        if (approve) {
          setRepairData({
            ...repairData, 
            status: "Cancelled",
            cancelRequestStatus: "Approved",
            cancelApprovedBy: user?.realName || "",
            cancelApprovedDate: new Date()
          })
          addNotification({
          type: "system",
          title: "取消申请已通过",
          message: `工单 ${taskId} 的取消申请已通过审批，工单已取消`,
          repairId: taskId,
          recipient: user?.realName || "系统",
        })
        } else {
          setRepairData({
            ...repairData, 
            cancelRequestStatus: "Rejected",
            cancelApprovedBy: user?.realName || "",
            cancelApprovedDate: new Date()
          })
        }
        window.location.reload()
      } else {
        alert(result.message || "审批失败")
      }
    } catch (error) {
      console.error("审批失败:", error)
      alert("审批失败，请重试")
    }
  }

  // 取消工单（管理员直接取消）
  const handleCancel = async () => {
    if (!cancelReason.trim() && !window.confirm("未填写取消原因，确定要取消工单吗？")) {
      return
    }

    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: 'Cancelled',
          id: taskId,
          cancelReason: cancelReason.trim() || undefined
        }),
      })

      const result = await response.json()
      if (result.success) {
        setIsCancelDialogOpen(false)
        setCancelReason("")
        setRepairData({...repairData, status: "Cancelled"})
        addNotification({
          type: "system",
          title: "工单已取消",
          message: `工单 ${taskId} 已被取消`,
          repairId: taskId,
          recipient: user?.realName || "系统",
        })
        window.location.reload()
      } else {
        alert(result.message || "更新工单状态失败")
      }
    } catch (error) {
      console.error("更新工单状态失败:", error)
      alert("更新工单状态失败，请重试")
    }
  }

  // 延期申请状态
  const [isDelayDialogOpen, setIsDelayDialogOpen] = useState(false)
  
  // 判定报废相关状态（已迁移至批次级别，保留兼容性）
  const [isScrappedDialogOpen, setIsScrappedDialogOpen] = useState(false)
  const [scrappedReason, setScrappedReason] = useState("")

  // 最终处理结果（TECHNICIAN_REPAIRING 阶段，技师在设备详情页选择后提交整批）
  const [finalOutcome, setFinalOutcome] = useState<string | null>(null)
  const [isSavingFinalOutcome, setIsSavingFinalOutcome] = useState(false)
  
  // 取消工单相关状态（管理员直接取消）
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  
  // 现场人员申请取消相关状态
  const [isCancelRequestDialogOpen, setIsCancelRequestDialogOpen] = useState(false)
  const [cancelRequestReason, setCancelRequestReason] = useState("")
  const [isSubmittingCancelRequest, setIsSubmittingCancelRequest] = useState(false)
  const [newCompletionDate, setNewCompletionDate] = useState<Date | undefined>(undefined)
  // 存放从后端读取到的延期原因（用于展示）
  const [delayReason, setDelayReason] = useState("")
  const [delayReasonError, setDelayReasonError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 处理延期申请提交
  const handleDelaySubmit = async () => {
    // 验证
    if (!newCompletionDate) {
      return
    }
    
    if (!delayReason.trim()) {
      setDelayReasonError("请填写延期原因")
      return
    }
    setIsSubmitting(true)
    
    // 调用后端 API，保存延期信息并更新状态
    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delay",
          id: taskId,
          delayTo: newCompletionDate.toISOString(),
          delayReason: delayReason.trim(),
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "延期申请失败")
      }

      // 更新前端状态：状态改为 delayed，并更新预计完成时间和延期原因
      setRepairData({
        ...repairData,
        expectedCompletionDate: newCompletionDate,
        status: "delayed",
      })

      // 发送通知给现场报告人员，告知已延期
      if (repairData.reporter) {
        try {
          addNotification({
            type: "repair_delayed",
            title: "维修延期通知",
            message: `您报修的设备“${repairData.deviceName || repairData.deviceModel}”已申请延期至 ${format(
              newCompletionDate,
              "yyyy年MM月dd日",
              { locale: zhCN }
            )}`,
            repairId: taskId,
            deviceName: repairData.deviceName,
            deviceModel: repairData.deviceModel,
            status: "delayed",
            recipient: repairData.reporter,
          })
        } catch (notifyError) {
          console.error("发送延期通知失败:", notifyError)
        }
      }
      
      // 关闭对话框
      setIsDelayDialogOpen(false)
      // 保留 delayReason 用于处理记录展示
      setDelayReasonError("")
    } catch (error) {
      console.error("延期申请失败", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 获取状态标签
  const getStatusBadge = (status: string) => {
    // 处理新状态
    const statusLower = status.toLowerCase()
    if (statusLower === "scrapped" || status === "Scrapped") {
      return <Badge variant="destructive">已报废</Badge>
    }
    if (statusLower === "return_unrepaired" || status === "Return_Unrepaired") {
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">拒修退回</Badge>
    }
    if (statusLower === "cancelled" || status === "Cancelled") {
      return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">已取消</Badge>
    }
    const normalizedStatus = normalizeTicketStatus(status)
    switch (normalizedStatus) {
      case TicketStatus.CREATED:
      case TicketStatus.WAREHOUSE_CONFIRMING:
        return <Badge className="bg-warning/15 text-warning-foreground border-warning/30">待处理</Badge>
      case TicketStatus.WAREHOUSE_CONFIRMED:
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">仓库已确认</Badge>
      case TicketStatus.IN_REPAIR:
        return <Badge className="bg-primary/15 text-primary border-primary/30">维修中</Badge>
      case TicketStatus.BUSINESS_REVIEW:
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">待商务处理</Badge>
      case TicketStatus.WAREHOUSE_SHIPPING:
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300">待发货</Badge>
      case TicketStatus.COMPLETED:
        return <Badge className="bg-success/15 text-success border-success/30">已完成</Badge>
      case TicketStatus.DELAYED:
        return <Badge className="bg-destructive/15 text-destructive border-destructive/30">已申请延期</Badge>
      case TicketStatus.UNREPAIRABLE:
        return <Badge className="bg-red-100 text-red-800 border-red-300">无法维修</Badge>
      default:
        return <Badge className="bg-muted text-muted-foreground border-border">未知状态</Badge>
    }
  }

  // 获取快递公司名称
  const getExpressCompanyName = (id: string) => {
    const company = LOGISTICS.find(c => c.id === id)
    return company ? company.name : id
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载工单详情中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-card border-b border-border z-10">
        <div className="flex items-center justify-between p-4 md:p-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">维修工单详情</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">序列号: {repairData.productSN}</p>
                {getStatusBadge(repairData.status)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* ⚠️ 单设备页面不再提供"维修完成/无法维修/判定报废"按钮。
                最终处理结果已移至工作台内部的"最终处理结果"卡片（TECHNICIAN_REPAIRING 阶段），
                批次级别的"提交全部处理结果"按钮在工单总览页面完成整批流转。 */}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto">
        {/* 工作流进度显示 */}
        <WorkflowProgress ticket={repairData} showDetails={true} />
        
        {/* 工作流操作栏（动作驱动）
            ⚠️ 维修人员在 IN_REPAIR 状态下的"发送报告"动作已移至批次维修报告编辑页面
            （repairs/edit/[batchId]），此处不再重复显示，避免操作入口混乱。
            其他角色（现场人员上传签字、商务审核）仍正常显示。
        */}
        {!inBatchMode && user && !(
          user.role === UserRole.TECHNICIAN &&
          (normalizeTicketStatus(repairData.status) === TicketStatus.IN_REPAIR ||
           normalizeTicketStatus(repairData.status) === TicketStatus.TECHNICIAN_REPAIRING)
        ) && (
          <TicketActionBar
            ticket={{
              id: repairData.id,
              batchId: repairData.batchId ?? undefined,
              status: normalizeTicketStatus(repairData.status) || repairData.status as any,
              faultPoint: repairData.faultPoint,
              repairCost: repairData.repairCost,
              signedReportPhoto: repairData.signedReportPhoto,
            }}
            currentUser={{
              id: user?.id || "",
              name: user?.realName || "未知用户",
              role: (user?.role ?? UserRole.TECHNICIAN) as UserRole,
            }}
            onActionSuccess={() => {
              // 刷新工单数据
              loadTicketData();
            }}
          />
        )}
        
        {/* 只有维修工程师才能看到延期按钮 */}
        {(user?.role === UserRole.TECHNICIAN && (repairData.status === "in_repair" || repairData.status === "processing")) && (
          <div className="flex justify-end mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsDelayDialogOpen(true)}
              className="text-muted-foreground"
            >
              <Calendar className="w-4 h-4 mr-2" />
              申请延期
            </Button>
          </div>
        )}
        <Tabs defaultValue="workbench" className="w-full">
          <TabsList className="grid w-full max-w-3xl grid-cols-2">
            <TabsTrigger value="workbench">工作台</TabsTrigger>
            <TabsTrigger value="photos">照片凭证</TabsTrigger>
          </TabsList>
          
          <TabsContent value="workbench" className="mt-6 space-y-4">
            {/* 4个工作台板块 */}
            <Accordion type="multiple" defaultValue={[]} className="w-full">
              {/* 板块1：现场报告（基础信息） */}
              <AccordionItem value="panel1">
                <AccordionTrigger className="text-base font-semibold">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    <span>现场报告（基础信息）</span>
                    <Badge variant="outline" className="ml-2">只读</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">提交日期</Label>
                          <p className="font-medium mt-1">
                            {repairData.submitDate ? format(repairData.submitDate, "yyyy-MM-dd HH:mm", { locale: zhCN }) : "待录入"}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">发出快递单号</Label>
                          <p className="font-medium mt-1">{repairData.trackingNumberIn || "待录入"}</p>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-sm text-muted-foreground">寄件人地址</Label>
                          <p className="font-medium mt-1">{repairData.senderAddress || "待录入"}</p>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-sm text-muted-foreground">联系人及电话</Label>
                          <p className="font-medium mt-1">{repairData.contactInfo || "待录入"}</p>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-sm text-muted-foreground">项目/客户名称</Label>
                          <p className="font-medium mt-1">{repairData.projectName || "待录入"}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">产品名称/大类</Label>
                          <p className="font-medium mt-1">{repairData.category || "待录入"}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">型号</Label>
                          <p className="font-medium mt-1">{repairData.modelName || "待录入"}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">数量</Label>
                          <p className="font-medium mt-1">{repairData.quantity || 1}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">产品序列号</Label>
                          {needsSupplementSN && (user?.role === UserRole.TECHNICIAN || user?.role === UserRole.ADMIN) ? (
                            <div className="mt-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="请输入设备序列号"
                                  value={newSerialNumber}
                                  onChange={(e) => {
                                    setNewSerialNumber(e.target.value)
                                    setSnValidationError("")
                                  }}
                                  className={cn("max-w-xs", snValidationError && "border-destructive")}
                                  disabled={isValidatingSN || isSubmittingSN}
                                />
                                <Button
                                  size="sm"
                                  onClick={handleSupplementSN}
                                  disabled={!newSerialNumber.trim() || !!snValidationError || isValidatingSN || isSubmittingSN}
                                >
                                  {isSubmittingSN ? "保存中..." : "补录 SN"}
                                </Button>
                              </div>
                              {snValidationError && (
                                <p className="text-xs text-destructive flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {snValidationError}
                                </p>
                              )}
                              {isValidatingSN && (
                                <p className="text-xs text-muted-foreground">正在验证序列号...</p>
                              )}
                            </div>
                          ) : (
                            <p className="font-medium mt-1">
                              {needsSupplementSN ? <span className="text-warning">待补录</span> : (repairData.productSN || (isTerminalStatus ? "" : "待录入"))}
                            </p>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-sm text-muted-foreground">故障描述</Label>
                          <p className="font-medium mt-1 whitespace-pre-line">{repairData.faultDescription || "待录入"}</p>
                        </div>
                      </div>
                      
                      {/* 现场人员操作按钮 */}
                      {user?.role === UserRole.REPORTER && !inBatchMode && (
                        <div className="mt-6 pt-4 border-t space-y-3">
                          {/* 申请取消按钮 - 仅在非批次模式下显示 */}
                          {repairData.status !== "Cancelled" && repairData.status !== "cancelled" && 
                           repairData.cancelRequestStatus !== "Approved" && repairData.cancelRequestStatus !== "Pending" && (
                            <Button 
                              variant="outline" 
                              className="border-destructive text-destructive hover:bg-destructive/10 w-full"
                              onClick={() => setIsCancelRequestDialogOpen(true)}
                            >
                              申请取消维修订单
                            </Button>
                          )}
                        </div>
                      )}
                      {/* 批次模式提示 */}
                      {user?.role === UserRole.REPORTER && inBatchMode && (
                        <div className="mt-6 pt-4 border-t">
                          <Alert className="border-blue-200 bg-blue-50">
                            <AlertCircle className="h-4 w-4 text-blue-600" />
                            <AlertDescription className="text-blue-800 text-sm">
                              此设备属于批次工单，如需取消请在批次工单主页面点击"申请取消批次工单"按钮。
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                      
                      {/* 显示取消申请状态 */}
                      {repairData.cancelRequestStatus === "Pending" && (
                        <div className="mt-6 pt-4 border-t">
                          <Alert className="border-orange-200 bg-orange-50">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            <AlertDescription className="text-orange-800">
                              <p className="font-medium mb-2">取消申请待审批</p>
                              <p className="text-sm mb-1">申请原因：{repairData.cancelRequestReason || "未填写"}</p>
                              {repairData.cancelRequestDate && (
                                <p className="text-sm">申请时间：{format(repairData.cancelRequestDate, "yyyy-MM-dd HH:mm", { locale: zhCN })}</p>
                              )}
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                      
                      {repairData.cancelRequestStatus === "Approved" && (
                        <div className="mt-6 pt-4 border-t">
                          <Alert className="border-green-200 bg-green-50">
                            <AlertCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                              <p className="font-medium mb-2">取消申请已通过</p>
                              {repairData.cancelApprovedBy && (
                                <p className="text-sm">审批人：{repairData.cancelApprovedBy}</p>
                              )}
                              {repairData.cancelApprovedDate && (
                                <p className="text-sm">审批时间：{format(repairData.cancelApprovedDate, "yyyy-MM-dd HH:mm", { locale: zhCN })}</p>
                              )}
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                      
                      {repairData.cancelRequestStatus === "Rejected" && (
                        <div className="mt-6 pt-4 border-t">
                          <Alert className="border-red-200 bg-red-50">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <AlertDescription className="text-red-800">
                              <p className="font-medium mb-2">取消申请已拒绝</p>
                              {repairData.cancelApprovedBy && (
                                <p className="text-sm">审批人：{repairData.cancelApprovedBy}</p>
                              )}
                              {repairData.cancelApprovedDate && (
                                <p className="text-sm">审批时间：{format(repairData.cancelApprovedDate, "yyyy-MM-dd HH:mm", { locale: zhCN })}</p>
                              )}
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              {/* 板块2：维修工作台（维修人员可编辑，管理员只读） */}
              {(user?.role === UserRole.TECHNICIAN || user?.role === UserRole.ADMIN) && (
                <AccordionItem value="panel2">
                  <AccordionTrigger className="text-base font-semibold">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      <span>维修工作台</span>
                      {user?.role === UserRole.ADMIN && (
                        <Badge variant="outline" className="ml-2">只读</Badge>
                      )}
                      {normalizeTicketStatus(repairData.status || "") === TicketStatus.PENDING_REPORTER_CONFIRM ? (
                        <Badge variant="outline" className="ml-2 bg-cyan-50 text-cyan-700 border-cyan-300">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          已提交·待现场确认
                        </Badge>
                      ) : repairData.faultPoint ? (
                        <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">已填写</Badge>
                      ) : null}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className={cn(
                        "pt-6 space-y-4", 
                        (user?.role === UserRole.ADMIN || 
                         repairData.cancelRequestStatus === "Pending" ||
                         repairData.status === TicketStatus.COMPLETED ||
                        // 仅在 Created / Warehouse_Confirming 两个状态下锁定维修工作台（仓库确认前）。
                        // 返厂状态（PENDING_FACTORY / FACTORY_FINISHED）不属于仓库确认流程，不在此集合中。
                        (user?.role === UserRole.TECHNICIAN && 
                         (() => {
                           const ns = normalizeTicketStatus(repairData.status || "")
                           const WAREHOUSE_LOCK_STATUSES = new Set<TicketStatus | null>([
                             TicketStatus.CREATED,
                             TicketStatus.WAREHOUSE_CONFIRMING,
                           ])
                           return WAREHOUSE_LOCK_STATUSES.has(ns)
                         })()) ||
                        // 维修报告已提交（Pending_Reporter_Confirm）且未进入二次编辑模式时，工作台只读
                        (user?.role === UserRole.TECHNICIAN &&
                         normalizeTicketStatus(repairData.status || "") === TicketStatus.PENDING_REPORTER_CONFIRM &&
                         !isEditingRepairAfterSubmit) ||
                        // 现场已签字、进入选择最终处理结果阶段（Technician_Repairing），维修内容只读，
                        // 仅"最终处理结果"卡片通过 pointer-events-auto 保持可交互
                        (user?.role === UserRole.TECHNICIAN &&
                         normalizeTicketStatus(repairData.status || "") === TicketStatus.TECHNICIAN_REPAIRING)
                        ) && "pointer-events-none opacity-75"
                      )}>
                        {/* 等待仓库确认的提示（仅维修人员看到） */}
                        {/* 仅 Created / Warehouse_Confirming 会显示此 Alert。                           */}
                        {/* 返厂状态（PENDING_FACTORY / FACTORY_FINISHED）不在集合内，永不触发。 */}
                        {(() => {
                          const normalizedStatus = normalizeTicketStatus(repairData.status || "")
                          const WAREHOUSE_LOCK_STATUSES = new Set<TicketStatus | null>([
                            TicketStatus.CREATED,
                            TicketStatus.WAREHOUSE_CONFIRMING,
                          ])
                          const shouldLock = user?.role === UserRole.TECHNICIAN &&
                            WAREHOUSE_LOCK_STATUSES.has(normalizedStatus)
                          
                          if (user?.role === UserRole.TECHNICIAN) {
                            console.log("[维修工作台] 状态检查:", {
                              原始状态: repairData.status,
                              规范化状态: normalizedStatus,
                              应该锁定: shouldLock,
                            })
                          }
                          
                          return shouldLock
                        })() && (
                          <Alert className="mb-4 border-yellow-300 bg-yellow-50 pointer-events-auto">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            <AlertDescription className="text-yellow-800">
                              <p className="font-semibold mb-1">等待仓库确认</p>
                              {normalizeTicketStatus(repairData.status || "") === TicketStatus.WAREHOUSE_CONFIRMING ? (
                                <p className="text-sm">
                                  设备序列号或型号已变更，需要仓库管理员重新确认设备信息。请通知仓库管理员在「仓库管理工作台 → 待确认批次」中刷新并重新确认此批次。
                                </p>
                              ) : (
                                <p className="text-sm">
                                  此工单尚未经过仓库管理员确认，维修工作台暂时锁定。请等待仓库管理员在「待确认批次」中确认设备信息并填写出厂日期后，再进行后续操作。
                                </p>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {/* 维修报告已提交（Pending_Reporter_Confirm）状态提示 */}
                        {user?.role === UserRole.TECHNICIAN &&
                         normalizeTicketStatus(repairData.status || "") === TicketStatus.PENDING_REPORTER_CONFIRM && (
                          <Alert className={cn(
                            "mb-4 pointer-events-auto",
                            isEditingRepairAfterSubmit
                              ? "border-orange-300 bg-orange-50"
                              : "border-cyan-300 bg-cyan-50"
                          )}>
                            {isEditingRepairAfterSubmit
                              ? <Pencil className="h-4 w-4 text-orange-600" />
                              : <CheckCircle2 className="h-4 w-4 text-cyan-600" />
                            }
                            <AlertDescription className={isEditingRepairAfterSubmit ? "text-orange-800" : "text-cyan-800"}>
                              {isEditingRepairAfterSubmit ? (
                                <>
                                  <p className="font-semibold mb-1">正在修改已提交的报告</p>
                                  <p className="text-sm">
                                    修改完成后点击下方"保存维修记录"按钮，保存后将重新等待现场人员确认。
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="font-semibold mb-1">维修报告已提交，待现场人员签字确认</p>
                                  <p className="text-sm mb-2">
                                    报告内容已锁定。如需修改报告内容，请点击下方按钮进入编辑模式。
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-cyan-400 text-cyan-700 hover:bg-cyan-100"
                                    onClick={() => setIsEditingRepairAfterSubmit(true)}
                                  >
                                    <Pencil className="w-3 h-3 mr-1" />
                                    修改报告
                                  </Button>
                                </>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* 取消申请中的提示 */}
                        {repairData.cancelRequestStatus === "Pending" && (
                          <Alert className="mb-4 border-orange-300 bg-orange-50 pointer-events-auto">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            <AlertDescription className="text-orange-800">
                              <p className="font-semibold mb-1">此工单正在申请取消中</p>
                              <p className="text-sm">
                                现场人员已提交取消申请，等待商务审批。在商务人员处理之前，维修工作台暂时锁定。
                              </p>
                              {repairData.cancelRequestReason && (
                                <p className="text-sm mt-2">
                                  <strong>申请原因：</strong>{repairData.cancelRequestReason}
                                </p>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {/* 管理员只读提示 */}
                        {user?.role === UserRole.ADMIN && (
                          <div className="mb-4 p-3 bg-muted/50 rounded-md border border-border pointer-events-auto">
                            <p className="text-sm text-muted-foreground">
                              <AlertCircle className="inline h-4 w-4 mr-1" />
                              此工作台仅维修人员可编辑，管理员仅可查看
                            </p>
                          </div>
                        )}
                        
                        {/* 复检模式提示 */}
                        {isRecheckMode && (
                          <Alert className="mb-4 border-orange-200 bg-orange-50">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            <AlertDescription className="text-orange-800">
                              设备已从原厂返回，请进行最终检测并录入维修结果。
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* === 故障与处理记录（合并原故障鉴定+处理过程） === */}
                        <Card className="mb-4">
                          <CardHeader>
                            <CardTitle className="text-base">故障与处理记录</CardTitle>
                            <CardDescription>记录保修判定、维修动作与处理方案</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* 保修判定 + 维修动作：并排 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-sm text-muted-foreground">保修判定</Label>
                                <Select
                                  value={warrantyStatusOverride ?? undefined}
                                  onValueChange={(value) =>
                                    setWarrantyStatusOverride(value as WarrantyStatus)
                                  }
                                >
                                  <SelectTrigger className="bg-muted/50 border-border w-full">
                                    <SelectValue placeholder="请选择保修状态（可覆盖系统判定）" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={WarrantyStatus.IN_WARRANTY}>保内</SelectItem>
                                    <SelectItem value={WarrantyStatus.OUT_OF_WARRANTY}>保外</SelectItem>
                                    <SelectItem value={WarrantyStatus.UNKNOWN}>未知 / 暂不判断</SelectItem>
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  系统会根据出厂日期给出初判，必要时可在此人工覆盖。
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm text-muted-foreground">
                                  维修动作 <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                  value={repairAction ?? undefined}
                                  onValueChange={(value) =>
                                    setRepairAction(value as RepairAction)
                                  }
                                >
                                  <SelectTrigger className="bg-muted/50 border-border w-full">
                                    <SelectValue placeholder="请选择本次维修的处理方式" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={RepairAction.ON_SITE_REPAIR}>直接维修</SelectItem>
                                    <SelectItem value={RepairAction.PART_REPLACEMENT}>更换配件</SelectItem>
                                    <SelectItem value={RepairAction.REPLACE_DEVICE}>更换设备</SelectItem>
                                    <SelectItem value={RepairAction.RMA}>返厂维修</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* 故障点与处理说明：合并为一个输入框，提交时同时写入 faultPoint 与 repairNotes */}
                            <div className="space-y-2">
                              <Label htmlFor="faultAndNotes">故障点与处理说明 <span className="text-destructive">*</span></Label>
                              <Textarea
                                id="faultAndNotes"
                                value={faultAndNotesCombined}
                                onChange={(e) => setFaultAndNotesCombined(e.target.value)}
                                placeholder={
                                  isRecheckMode
                                    ? "请描述复检结果、故障点及处理过程..."
                                    : "请描述故障点与本次维修过程、使用的手段、替换的部件等（可合并填写）..."
                                }
                                className="min-h-[120px]"
                              />
                              <p className="text-xs text-muted-foreground">
                                {isRecheckMode
                                  ? '填写完成后，请通过下方"工作流操作栏"发送维修报告至现场确认'
                                  : '填写完成后，请通过下方"工作流操作栏"发送维修报告至现场确认'}
                              </p>
                            </div>

                            {/* RMA 返厂信息：仅在选择返厂维修时显示 */}
                            {repairAction === RepairAction.RMA && (
                              <div className="mt-2 rounded-md border border-dashed border-border bg-muted/40 p-4 space-y-4">
                                <p className="text-sm font-medium text-muted-foreground">
                                  返厂信息（仅在选择“返厂维修”时需要填写）
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm text-muted-foreground">返厂维修日期</Label>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button
                                          variant="outline"
                                          className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !repairFormData.factoryRepairDate && "text-muted-foreground"
                                          )}
                                        >
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {repairFormData.factoryRepairDate
                                            ? format(repairFormData.factoryRepairDate, "yyyy-MM-dd", { locale: zhCN })
                                            : "选择日期"}
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <CalendarComponent
                                          mode="single"
                                          selected={repairFormData.factoryRepairDate || undefined}
                                          onSelect={(date) =>
                                            setRepairFormData({ ...repairFormData, factoryRepairDate: date || null })
                                          }
                                          initialFocus
                                          locale={zhCN}
                                          captionLayout="dropdown"
                                          fromYear={2010}
                                          toYear={new Date().getFullYear() + 5}
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm text-muted-foreground">返厂快递单号</Label>
                                    <Input
                                      value={repairFormData.factoryTrackingNum}
                                      onChange={(e) =>
                                        setRepairFormData({ ...repairFormData, factoryTrackingNum: e.target.value })
                                      }
                                      placeholder="请输入返厂快递单号"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm text-muted-foreground">供应商名称</Label>
                                    <Input
                                      value={repairFormData.supplierName}
                                      onChange={(e) =>
                                        setRepairFormData({ ...repairFormData, supplierName: e.target.value })
                                      }
                                      placeholder="请输入供应商名称"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* === 区块三：物料与费用 === */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">物料与费用</CardTitle>
                            <CardDescription>记录更换配件与收费信息</CardDescription>
                          </CardHeader>
                          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="materialCode">物料代码</Label>
                              <Input
                                id="materialCode"
                                value={repairFormData.materialCode}
                                onChange={(e) =>
                                  setRepairFormData({ ...repairFormData, materialCode: e.target.value })
                                }
                                placeholder="待录入（可手动输入或从数据库获取）"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="deviceName">物料名称（标准名）</Label>
                              <Input
                                id="deviceName"
                                value={repairFormData.deviceName}
                                onChange={(e) =>
                                  setRepairFormData({ ...repairFormData, deviceName: e.target.value })
                                }
                                placeholder="待录入"
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2 lg:col-span-3">
                              <div className="flex items-center justify-between mb-1">
                                <Label htmlFor="fullSpec">规格型号</Label>
                                {repairData.productSN && repairData.productSN !== "PENDING" && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAutoFillFullSpec}
                                    disabled={isLoadingFullSpec}
                                    className="h-7 text-xs"
                                  >
                                    <RefreshCw
                                      className={cn(
                                        "w-3 h-3 mr-1",
                                        isLoadingFullSpec && "animate-spin"
                                      )}
                                    />
                                    {isLoadingFullSpec ? "获取中..." : "从数据库获取"}
                                  </Button>
                                )}
                              </div>
                              <Input
                                id="fullSpec"
                                value={repairFormData.fullSpec}
                                onChange={(e) =>
                                  setRepairFormData({ ...repairFormData, fullSpec: e.target.value })
                                }
                                placeholder="待录入（可手动输入或从数据库获取）"
                              />
                              {repairData.productSN && repairData.productSN !== "PENDING" && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  提示：可手动输入，或点击"从数据库获取"按钮自动填充（会同时填充物料代码、物料名称和规格型号）
                                </p>
                              )}
                            </div>
                            <div className="space-y-2 md:col-span-2 lg:col-span-3">
                              <Label htmlFor="repairCost">收费金额（元）</Label>
                              <Input
                                id="repairCost"
                                type="number"
                                step="0.01"
                                min="0"
                                value={repairFormData.repairCost !== null ? repairFormData.repairCost : ""}
                                onChange={(e) => {
                                  const value = e.target.value === "" ? null : Number(e.target.value)
                                  setRepairFormData({ ...repairFormData, repairCost: value })
                                }}
                                placeholder="0.00（质保期内填0，过保填写金额）"
                              />
                            </div>
                          </CardContent>
                        </Card>
                        {/* 保存按钮：TECHNICIAN_REPAIRING 阶段维修内容已锁定，隐藏此按钮，
                            仅通过下方"最终处理结果"卡片操作 */}
                        {!(user?.role === UserRole.TECHNICIAN &&
                            normalizeTicketStatus(repairData.status || "") === TicketStatus.TECHNICIAN_REPAIRING) && (
                          <div className="flex justify-end pt-4 border-t">
                            <Button 
                              onClick={handleSaveRepair} 
                              disabled={
                                isSavingRepair || 
                                (isRecheckMode && !faultAndNotesCombined.trim())
                              }
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {isSavingRepair 
                                ? "保存中..." 
                                : isRecheckMode
                                  ? "维修完成 (复检通过)"
                                  : "保存维修记录"}
                            </Button>
                          </div>
                        )}

                        {/* ── TECHNICIAN_REPAIRING 阶段：维修内容只读提示 ─────────────── */}
                        {user?.role === UserRole.TECHNICIAN &&
                          normalizeTicketStatus(repairData.status) === TicketStatus.TECHNICIAN_REPAIRING && (
                          <Alert className="mb-2 border-indigo-300 bg-indigo-50 pointer-events-auto">
                            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                            <AlertDescription className="text-indigo-800">
                              <p className="font-semibold mb-1">现场已签字，维修内容已锁定</p>
                              <p className="text-sm">报告内容已由现场人员确认，无需再次修改。请在下方选择本台设备的最终处理结果。</p>
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* ── 最终处理结果（仅 TECHNICIAN_REPAIRING 阶段可见）──────────── */}
                        {user?.role === UserRole.TECHNICIAN &&
                          normalizeTicketStatus(repairData.status) === TicketStatus.TECHNICIAN_REPAIRING && (
                          <Card className="border-2 border-indigo-300 bg-indigo-50/50 mt-4 pointer-events-auto">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base font-semibold text-indigo-800 flex items-center gap-2">
                                最终处理结果
                              </CardTitle>
                              <p className="text-xs text-indigo-600">
                                请为本台设备选择最终处理结果，保存后前往工单总览确认所有设备均已选择，再点击"提交全部处理结果"完成整批工单。
                              </p>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {([
                                  { value: FinalOutcome.COMPLETED,         label: FINAL_OUTCOME_LABELS[FinalOutcome.COMPLETED],         desc: "设备已修复，准备发回",        color: "border-green-400 bg-green-50 text-green-800"   },
                                  { value: FinalOutcome.SCRAPPED,          label: FINAL_OUTCOME_LABELS[FinalOutcome.SCRAPPED],          desc: "无需维修，设备直接入库存放",  color: "border-red-400 bg-red-50 text-red-800"         },
                                  { value: FinalOutcome.RETURN_UNREPAIRED, label: FINAL_OUTCOME_LABELS[FinalOutcome.RETURN_UNREPAIRED], desc: "设备无法修复，原样退回客户", color: "border-orange-400 bg-orange-50 text-orange-800" },
                                ] as { value: FinalOutcome; label: string; desc: string; color: string }[]).map(option => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFinalOutcome(option.value)}
                                    className={`rounded-lg border-2 p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                                      finalOutcome === option.value
                                        ? `${option.color} ring-2 ring-offset-1`
                                        : "border-border bg-background hover:border-indigo-300"
                                    }`}
                                  >
                                    <div className="font-medium text-sm">{option.label}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{option.desc}</div>
                                  </button>
                                ))}
                              </div>
                              {finalOutcome && (
                                <p className="text-xs text-indigo-700 font-medium">
                                  已选择：{FINAL_OUTCOME_LABELS[finalOutcome as FinalOutcome] ?? finalOutcome}
                                </p>
                              )}
                              <div className="flex justify-end pt-2 border-t border-indigo-200">
                                <Button
                                  onClick={handleSaveFinalOutcome}
                                  disabled={isSavingFinalOutcome || !finalOutcome}
                                  className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                  {isSavingFinalOutcome ? "保存中..." : "保存处理结果"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* 板块3：商务/管理员工作台 */}
              {(user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN || user?.role === UserRole.BUSINESS) && (
                <AccordionItem value="panel3">
                  <AccordionTrigger className="text-base font-semibold">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      <span>商务/管理员工作台</span>
                      {user?.role === UserRole.TECHNICIAN && (
                        <Badge variant="outline" className="ml-2">只读</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        {user?.role === UserRole.TECHNICIAN && (
                          <div className="mb-4 p-3 bg-muted/50 rounded-md border border-border">
                            <p className="text-sm text-muted-foreground">
                              <AlertCircle className="inline h-4 w-4 mr-1" />
                              此工作台仅管理员和商务人员可编辑，维修人员仅可查看
                            </p>
                          </div>
                        )}
                        
                        {/* 显示待审批的取消申请 */}
                        {repairData.cancelRequestStatus === "Pending" && (user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) && (
                          <Alert className="mb-4 border-orange-200 bg-orange-50">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            <AlertDescription className="text-orange-800">
                              <p className="font-medium mb-2">待审批：现场人员申请取消工单</p>
                              <p className="text-sm mb-1">申请原因：{repairData.cancelRequestReason || "未填写"}</p>
                              {repairData.cancelRequestDate && (
                                <p className="text-sm mb-3">申请时间：{format(repairData.cancelRequestDate, "yyyy-MM-dd HH:mm", { locale: zhCN })}</p>
                              )}
                              <div className="flex gap-2 mt-3">
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleApproveCancelRequest(true)}
                                >
                                  通过申请
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="border-red-500 text-red-600 hover:bg-red-50"
                                  onClick={() => handleApproveCancelRequest(false)}
                                >
                                  拒绝申请
                                </Button>
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {/* 返厂物流管理区域（仅在 Pending_Factory 或 Factory_Finished 状态时显示） */}
                        {(repairData.status === "Pending_Factory" || repairData.status === "pending_factory" || 
                          repairData.status === "Factory_Finished" || repairData.status === "factory_finished") && (
                          <div className="mb-6 p-4 bg-blue-50 rounded-md border border-blue-200">
                            <h3 className="text-base font-semibold mb-4 text-blue-900">返厂物流管理</h3>

                            {/* 维修工程师提交的返厂基础信息（只读回显） */}
                            <div className="mb-4 p-3 bg-white rounded border border-blue-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">供应商名称</p>
                                <p className="font-medium text-sm">{repairData.supplierName || "未填写"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">厂家单号（返厂快递）</p>
                                <p className="font-medium text-sm">{repairData.factoryTrackingNum || "未填写"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">维修费用（元）</p>
                                <p className="font-medium text-sm">
                                  {repairData.repairCost != null ? `¥${repairData.repairCost}` : "未填写"}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div>
                                <Label htmlFor="adminFactoryRepairDate">发往原厂日期</Label>
                                {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) ? (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        id="adminFactoryRepairDate"
                                        variant="outline"
                                        className={cn("w-full justify-start text-left font-normal mt-1", !adminFormData.factoryRepairDate && "text-muted-foreground")}
                                      >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {adminFormData.factoryRepairDate ? (
                                          format(adminFormData.factoryRepairDate, "yyyy-MM-dd", { locale: zhCN })
                                        ) : (
                                          <span>选择日期</span>
                                        )}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent
                                        mode="single"
                                        selected={adminFormData.factoryRepairDate || undefined}
                                        onSelect={(date) => setAdminFormData({ ...adminFormData, factoryRepairDate: date || null })}
                                        initialFocus
                                        locale={zhCN}
                                        captionLayout="dropdown"
                                        fromYear={2010}
                                        toYear={new Date().getFullYear() + 5}
                                      />
                                    </PopoverContent>
                                  </Popover>
                                ) : (
                                  <p className="font-medium mt-1">
                                    {adminFormData.factoryRepairDate 
                                      ? format(adminFormData.factoryRepairDate, "yyyy-MM-dd", { locale: zhCN })
                                      : "待录入"}
                                  </p>
                                )}
                              </div>
                              <div>
                                <Label htmlFor="adminFactoryTrackingNum">发往原厂快递单号</Label>
                                {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) ? (
                                  <Input
                                    id="adminFactoryTrackingNum"
                                    value={adminFormData.factoryTrackingNum}
                                    onChange={(e) => setAdminFormData({ ...adminFormData, factoryTrackingNum: e.target.value })}
                                    placeholder="待录入"
                                    className="mt-1"
                                  />
                                ) : (
                                  <p className="font-medium mt-1">{adminFormData.factoryTrackingNum || "待录入"}</p>
                                )}
                              </div>
                            </div>
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) && (repairData.status === "Pending_Factory" || repairData.status === "pending_factory") && (
                              <div className="flex gap-2 mt-4">
                                <Button 
                                  variant="outline" 
                                  onClick={handleSaveFactoryLogistics}
                                  disabled={isSavingAdmin}
                                >
                                  <Save className="w-4 h-4 mr-2" />
                                  保存返厂物流信息
                                </Button>
                                <Button 
                                  onClick={handleConfirmFactoryReceived}
                                  disabled={isSavingAdmin}
                                >
                                  <Truck className="w-4 h-4 mr-2" />
                                  确认收到原厂寄回设备
                                </Button>
                              </div>
                          )}
                        </div>
                        )}
                        
                        {/* 设备保修状态显示 - 维修人员必看 */}
                        {repairData.manufactureDate && (
                          <div className="p-4 rounded-lg border mb-4" style={{
                            backgroundColor: repairData.warrantyStatus === "InWarranty" ? "#f0fdf4" : "#fef2f2",
                            borderColor: repairData.warrantyStatus === "InWarranty" ? "#86efac" : "#fca5a5"
                          }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <ShieldCheck className={cn(
                                  "h-5 w-5",
                                  repairData.warrantyStatus === "InWarranty" ? "text-green-600" : "text-red-600"
                                )} />
                                <div>
                                  <p className="font-semibold text-sm">
                                    {repairData.warrantyStatus === "InWarranty" ? "✅ 在保修期内" : "⚠️ 已过保修期"}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    出厂日期：{format(new Date(repairData.manufactureDate), "yyyy-MM-dd", { locale: zhCN })}
                                  </p>
                                </div>
                              </div>
                              <Badge 
                                variant={repairData.warrantyStatus === "InWarranty" ? "default" : "destructive"}
                                className={cn(
                                  repairData.warrantyStatus === "InWarranty" && "bg-green-600"
                                )}
                              >
                                {repairData.warrantyStatus === "InWarranty" ? "保内" : "保外"}
                              </Badge>
                            </div>
                          </div>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {/* 管理员填写字段（根据新的业务逻辑） */}
                          <div className="flex items-center justify-between">
                            <Label htmlFor="isChargeable">是否收费（确认）</Label>
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) ? (
                              <Switch
                                id="isChargeable"
                                checked={adminFormData.isChargeable}
                                onCheckedChange={(checked) => setAdminFormData({ ...adminFormData, isChargeable: checked })}
                              />
                            ) : (
                              <Badge variant={adminFormData.isChargeable ? "default" : "outline"}>
                                {adminFormData.isChargeable ? "是" : "否"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="isPaymentReceived">收费是否到账</Label>
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) ? (
                              <Switch
                                id="isPaymentReceived"
                                checked={adminFormData.isPaymentReceived}
                                onCheckedChange={(checked) => setAdminFormData({ ...adminFormData, isPaymentReceived: checked })}
                              />
                            ) : (
                              <Badge variant={adminFormData.isPaymentReceived ? "default" : "outline"}>
                                {adminFormData.isPaymentReceived ? "是" : "否"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="isInvoiced">是否开票</Label>
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) ? (
                              <Switch
                                id="isInvoiced"
                                checked={adminFormData.isInvoiced}
                                onCheckedChange={(checked) => setAdminFormData({ ...adminFormData, isInvoiced: checked })}
                              />
                            ) : (
                              <Badge variant={adminFormData.isInvoiced ? "default" : "outline"}>
                                {adminFormData.isInvoiced ? "是" : "否"}
                              </Badge>
                            )}
                          </div>
                          {adminFormData.isInvoiced && (
                            <div className="md:col-span-2 lg:col-span-3">
                              <Label htmlFor="clientName">客户名称（开票时必填）</Label>
                              {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) ? (
                                <Input
                                  id="clientName"
                                  value={adminFormData.clientName}
                                  onChange={(e) => setAdminFormData({ ...adminFormData, clientName: e.target.value })}
                                  placeholder="开票时必填"
                                  className="mt-1"
                                />
                              ) : (
                                <p className="font-medium mt-1">{adminFormData.clientName || "待录入"}</p>
                              )}
                            </div>
                          )}
                        </div>
                        {/* 商务/管理员操作按钮 */}
                        {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) && (
                          <div className="flex gap-2 pt-4 border-t">
                            <Button 
                              variant="outline" 
                              className="border-orange-500 text-orange-600 hover:bg-orange-50"
                              onClick={handleReturnUnrepaired}
                              disabled={isSavingAdmin || repairData.status === "Cancelled" || repairData.status === "Scrapped"}
                            >
                              客户拒修/原样退回
                            </Button>
                            {(repairData.status === "Created" || repairData.status === "pending" || 
                              repairData.status === "In_Repair" || repairData.status === "in_repair" ||
                              repairData.status === "Admin_Review" || repairData.status === "admin_review") && (
                              <Button 
                                variant="outline" 
                                className="border-gray-500 text-gray-600 hover:bg-gray-50"
                                onClick={() => setIsCancelDialogOpen(true)}
                                disabled={isSavingAdmin}
                              >
                                取消工单
                              </Button>
                            )}
                          </div>
                        )}
                        {/* 🔒 更新商务信息按钮 - 仅管理员和商务人员可见 */}
                        {(user?.role === UserRole.ADMIN || user?.role === UserRole.BUSINESS) && (
                          <div className="flex justify-end pt-4 border-t">
                            <Button onClick={handleSaveAdmin} disabled={isSavingAdmin}>
                              <Save className="w-4 h-4 mr-2" />
                              {isSavingAdmin ? "保存中..." : "更新商务信息"}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* 板块4：物流发货工作台（只有仓库管理员可以编辑） */}
              {/* 修复：仓库人员在编辑模式下始终显示此板块，不受工单状态限制 */}
              {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) && (
                <AccordionItem value="panel4">
                  <AccordionTrigger className="text-base font-semibold">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      <span>物流发货工作台</span>
                      {repairData.returnTrackingNum && (
                        <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">已发货</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="receivedDate">收到日期</Label>
                            {/* 修复：仓库人员在编辑模式下始终可编辑，不受状态限制 */}
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    id="receivedDate"
                                    variant="outline"
                                    className={cn("w-full justify-start text-left font-normal mt-1", !warehouseFormData.receivedDate && "text-muted-foreground")}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {warehouseFormData.receivedDate ? (
                                      format(warehouseFormData.receivedDate, "yyyy-MM-dd", { locale: zhCN })
                                    ) : (
                                      <span>待录入</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={warehouseFormData.receivedDate || undefined}
                                    onSelect={(date) => setWarehouseFormData({ ...warehouseFormData, receivedDate: date || null })}
                                    initialFocus
                                    locale={zhCN}
                                    captionLayout="dropdown"
                                    fromYear={2010}
                                    toYear={new Date().getFullYear() + 5}
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <p className="font-medium mt-1">
                                {warehouseFormData.receivedDate ? format(warehouseFormData.receivedDate, "yyyy-MM-dd", { locale: zhCN }) : "待录入"}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="factoryShipDate">出厂日期</Label>
                            {/* 修复：仓库人员在编辑模式下始终可编辑出厂日期，不受工单状态限制 */}
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    id="factoryShipDate"
                                    variant="outline"
                                    className={cn("w-full justify-start text-left font-normal mt-1", !warehouseFormData.factoryShipDate && "text-muted-foreground")}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {warehouseFormData.factoryShipDate ? (
                                      format(warehouseFormData.factoryShipDate, "yyyy-MM-dd", { locale: zhCN })
                                    ) : (
                                      <span>待录入</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={warehouseFormData.factoryShipDate || undefined}
                                    onSelect={(date) => setWarehouseFormData({ ...warehouseFormData, factoryShipDate: date || null })}
                                    initialFocus
                                    locale={zhCN}
                                    captionLayout="dropdown"
                                    fromYear={2010}
                                    toYear={new Date().getFullYear() + 5}
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <p className="font-medium mt-1">
                                {warehouseFormData.factoryShipDate ? format(warehouseFormData.factoryShipDate, "yyyy-MM-dd", { locale: zhCN }) : "待录入"}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="returnDate">返还客户日期</Label>
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    id="returnDate"
                                    variant="outline"
                                    className={cn("w-full justify-start text-left font-normal mt-1", !warehouseFormData.returnDate && "text-muted-foreground")}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {warehouseFormData.returnDate ? (
                                      format(warehouseFormData.returnDate, "yyyy-MM-dd", { locale: zhCN })
                                    ) : (
                                      <span>待录入</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={warehouseFormData.returnDate || undefined}
                                    onSelect={(date) => setWarehouseFormData({ ...warehouseFormData, returnDate: date || null })}
                                    initialFocus
                                    locale={zhCN}
                                    captionLayout="dropdown"
                                    fromYear={2010}
                                    toYear={new Date().getFullYear() + 5}
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <p className="font-medium mt-1">
                                {warehouseFormData.returnDate ? format(warehouseFormData.returnDate, "yyyy-MM-dd", { locale: zhCN }) : "待录入"}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="returnQuantity">返还客户数量</Label>
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) ? (
                              <Input
                                id="returnQuantity"
                                type="number"
                                value={warehouseFormData.returnQuantity}
                                onChange={(e) => setWarehouseFormData({ ...warehouseFormData, returnQuantity: Number(e.target.value) || 1 })}
                                className="mt-1"
                              />
                            ) : (
                              <p className="font-medium mt-1">{warehouseFormData.returnQuantity || 1}</p>
                            )}
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor="returnTrackingNum">返还客户快递单号</Label>
                            {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) ? (
                              <Input
                                id="returnTrackingNum"
                                value={warehouseFormData.returnTrackingNum}
                                onChange={(e) => setWarehouseFormData({ ...warehouseFormData, returnTrackingNum: e.target.value })}
                                placeholder="待录入"
                                className="mt-1"
                              />
                            ) : (
                              <p className="font-medium mt-1">{warehouseFormData.returnTrackingNum || "待录入"}</p>
                            )}
                          </div>
                        </div>
                        {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) && (
                          <div className="pt-4 border-t space-y-2">
                            <p className="text-xs text-muted-foreground">
                              填写返还单号后，工单状态将自动流转为"已完成"
                            </p>
                            <div className="flex justify-end">
                              <Button onClick={handleSaveWarehouse} disabled={isSavingWarehouse}>
                                <Save className="w-4 h-4 mr-2" />
                                {isSavingWarehouse ? "保存中..." : "确认发货/完结工单"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </TabsContent>

          <TabsContent value="photos" className="mt-6 space-y-6">
            {/* 设备铭牌照片 */}
            <Card>
              <CardHeader>
                <CardTitle>设备铭牌照片</CardTitle>
                <CardDescription>显示设备编号的铭牌照片</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {repairData.devicePhotos.length > 0 ? (
                    repairData.devicePhotos.map((photo, index) => {
                      // 使用 normalizeImageUrl 统一处理新旧 URL 格式（兼容 /uploads/... 和 https://...）
                      const src = normalizeImageUrl(photo)
                      return (
                        <div key={index} className="aspect-video rounded-lg overflow-hidden border border-border">
                          <img
                            src={src}
                            alt="设备铭牌照片"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // 图片丢失时显示占位图，避免无限触发 onError
                              if (e.currentTarget.dataset.fallbackApplied !== "true") {
                                e.currentTarget.dataset.fallbackApplied = "true"
                                e.currentTarget.src = "/placeholder.jpg"
                              }
                            }}
                          />
                        </div>
                      )
                    })
                  ) : (
                    <div className="md:col-span-2 p-8 text-center border border-dashed rounded-lg">
                      <p className="text-muted-foreground">暂无设备铭牌照片</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 补录 SN 对话框 */}
        <Dialog open={isSupplementSNDialogOpen} onOpenChange={setIsSupplementSNDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>补录设备序列号</DialogTitle>
              <DialogDescription>
                请输入设备序列号，系统将验证该序列号是否存在于设备档案中
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newSerialNumber">设备序列号</Label>
                <Input
                  id="newSerialNumber"
                  placeholder="请输入设备序列号"
                  value={newSerialNumber}
                  onChange={(e) => {
                    setNewSerialNumber(e.target.value)
                    setSnValidationError("")
                  }}
                  className={cn(
                    snValidationError && "border-destructive focus-visible:ring-destructive"
                  )}
                  disabled={isValidatingSN || isSubmittingSN}
                />
                {snValidationError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {snValidationError}
                  </p>
                )}
                {isValidatingSN && (
                  <p className="text-xs text-muted-foreground">正在验证序列号...</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsSupplementSNDialogOpen(false)
                setNewSerialNumber("")
                setSnValidationError("")
              }}>
                取消
              </Button>
              <Button
                onClick={handleSupplementSN}
                disabled={!newSerialNumber.trim() || !!snValidationError || isValidatingSN || isSubmittingSN}
              >
                {isSubmittingSN ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    保存中...
                  </span>
                ) : (
                  "确认补录"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 延期申请对话框 - 只有维修工程师可以看到 */}
        <Dialog open={isDelayDialogOpen} onOpenChange={setIsDelayDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>申请延期</DialogTitle>
              <DialogDescription>
                请选择新的预计完成时间并填写延期原因
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newCompletionDate">新的预计完成时间</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="newCompletionDate"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newCompletionDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newCompletionDate ? (
                        format(newCompletionDate, "yyyy年MM月dd日", { locale: zhCN })
                      ) : (
                        <span>选择日期</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={newCompletionDate}
                      onSelect={setNewCompletionDate}
                      initialFocus
                      disabled={(date) => 
                        date < new Date() || 
                        date <= repairData.expectedCompletionDate
                      }
                      locale={zhCN}
                      captionLayout="dropdown"
                      fromYear={2010}
                      toYear={new Date().getFullYear() + 5}
                    />
                  </PopoverContent>
                </Popover>
                {!newCompletionDate && (
                  <p className="text-xs text-muted-foreground">
                    必须选择晚于当前预计完成时间的日期
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="delayReason">延期原因</Label>
                <Textarea
                  id="delayReason"
                  value={delayReason}
                  onChange={(e) => {
                    setDelayReason(e.target.value)
                    if (e.target.value.trim()) {
                      setDelayReasonError("")
                    }
                  }}
                  placeholder="请详细说明延期原因..."
                  className={cn(
                    "resize-none",
                    delayReasonError && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {delayReasonError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {delayReasonError}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDelayDialogOpen(false)}>取消</Button>
              <Button 
                onClick={handleDelaySubmit} 
                disabled={isSubmitting || !newCompletionDate || !delayReason.trim()}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    提交中...
                  </span>
                ) : (
                  "确认更改"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 现场人员申请取消对话框 */}
        <Dialog open={isCancelRequestDialogOpen} onOpenChange={setIsCancelRequestDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>申请取消维修订单</DialogTitle>
              <DialogDescription>
                请填写取消原因，提交后需要商务人员审批通过才能取消工单。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cancelRequestReason">取消原因 *</Label>
                <Textarea
                  id="cancelRequestReason"
                  value={cancelRequestReason}
                  onChange={(e) => setCancelRequestReason(e.target.value)}
                  placeholder="请详细说明取消原因，例如：误操作、客户撤销、设备已自行修复等"
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsCancelRequestDialogOpen(false)
                setCancelRequestReason("")
              }}>
                取消
              </Button>
              <Button
                onClick={handleRequestCancel}
                disabled={!cancelRequestReason.trim() || isSubmittingCancelRequest}
              >
                {isSubmittingCancelRequest ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    提交中...
                  </span>
                ) : (
                  "提交申请"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 判定报废对话框 */}
        <Dialog open={isScrappedDialogOpen} onOpenChange={setIsScrappedDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-destructive">判定报废</DialogTitle>
              <DialogDescription>
                确定要将此工单判定为报废吗？此操作不可撤销。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="scrappedReason">报废原因（选填）</Label>
                <Textarea
                  id="scrappedReason"
                  placeholder="请填写报废原因，例如：设备严重损坏无法修复、缺少关键部件等"
                  value={scrappedReason}
                  onChange={(e) => setScrappedReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsScrappedDialogOpen(false)
                setScrappedReason("")
              }}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleScrapped}
              >
                确认报废
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 取消工单对话框 */}
        <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>取消工单</DialogTitle>
              <DialogDescription>
                确定要取消此工单吗？取消后的工单将不会出现在待办列表中，但可以在历史记录中查看。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cancelReason">取消原因（选填）</Label>
                <Textarea
                  id="cancelReason"
                  placeholder="请填写取消原因，例如：误操作、客户撤销等"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsCancelDialogOpen(false)
                setCancelReason("")
              }}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
              >
                确认取消
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}