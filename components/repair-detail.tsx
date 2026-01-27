"use client"

import { useState, useEffect, useRef } from "react"
import { ArrowLeft, CalendarIcon, Clock, AlertCircle, FileText, Truck, MapPin, Camera, Calendar, ClockIcon, ShieldCheck, ShieldAlert, User, Wrench, Save, RefreshCw } from "lucide-react"
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

interface RepairDetailProps {
  taskId: string
  onBack: () => void
}

// 后端返回的历史记录条目类型
interface TicketHistoryEntry {
  actionType: string
  oldStatus?: string | null
  newStatus?: string | null
  delayTo?: string | null
  delayReason?: string | null
  createdAt: string
}

export default function RepairDetail({ taskId, onBack }: RepairDetailProps) {
  const { addNotification } = useNotificationContext();
  const { user } = useAuth();
  
  // 获取报告人头像
  const [reporterAvatar, setReporterAvatar] = useState<string>("/placeholder-user.jpg");
  const [reporterPhone, setReporterPhone] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<TicketHistoryEntry[]>([]);
  
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
    cancelApprovedDate: null as Date | null
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
  // 返厂维修相关状态
  const [isOutsourced, setIsOutsourced] = useState(false)
  const [adminFormData, setAdminFormData] = useState({
    // 管理员只填写这三个字段（根据Excel表格）
    repairCost: null as number | null,
    clientName: "",
    isInvoiced: false,
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
  const [isLoadingFullSpec, setIsLoadingFullSpec] = useState(false)

  // 补录 SN 相关状态
  const [isSupplementSNDialogOpen, setIsSupplementSNDialogOpen] = useState(false)
  const [newSerialNumber, setNewSerialNumber] = useState("")
  const [snValidationError, setSnValidationError] = useState("")
  const [isValidatingSN, setIsValidatingSN] = useState(false)
  const [isSubmittingSN, setIsSubmittingSN] = useState(false)
  const validationTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 从 SQL Server 加载工单数据
  useEffect(() => {
    const loadRepairData = async () => {
      if (!taskId) return;
      
      setIsLoading(true);
      try {
        const response = await fetch(`/api/tickets/${taskId}`);
        if (response.ok) {
          const result = await response.json();
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
              history?: TicketHistoryEntry[]
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
            
            // 统一转换为小写进行匹配，更可靠
            const dbStatusLower = (dbStatus || "").toLowerCase().trim()
            
            let mappedStatus: string
            if (dbStatusLower === "created" || dbStatusLower === "pending") {
              mappedStatus = "created"  // 待处理
            } else if (dbStatusLower === "in_repair" || dbStatusLower === "processing") {
              mappedStatus = "in_repair"  // 维修中
            } else if (dbStatusLower === "admin_review") {
              mappedStatus = "admin_review"  // 待商务处理
            } else if (dbStatusLower === "pending_shipment") {
              mappedStatus = "pending_shipment"  // 待发货
            } else if (dbStatusLower === "completed") {
              mappedStatus = "completed"  // 已完成
            } else if (dbStatusLower === "unrepairable") {
              mappedStatus = "unrepairable"  // 无法维修
            } else if (dbStatusLower === "delayed") {
              mappedStatus = "delayed"  // 已延期
            } else if (dbStatusLower === "scrapped") {
              mappedStatus = "scrapped"  // 已报废
            } else if (dbStatusLower === "return_unrepaired") {
              mappedStatus = "return_unrepaired"  // 拒修退回
            } else if (dbStatusLower === "cancelled") {
              mappedStatus = "cancelled"  // 已取消
            } else {
              // 默认状态为待处理
              mappedStatus = "created"
              console.warn("未知状态值，使用默认状态 'created':", dbStatus)
            }
            
            console.log("状态映射:", { 
              原始状态: dbStatus, 
              处理后: dbStatusLower, 
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
              // 取消申请相关字段
              cancelRequestStatus: ticket.cancelRequestStatus || null,
              cancelRequestReason: ticket.cancelRequestReason || null,
              cancelRequestDate: parseDate(ticket.cancelRequestDate),
              cancelApprovedBy: ticket.cancelApprovedBy || null,
              cancelApprovedDate: parseDate(ticket.cancelApprovedDate),
            }
            
            setRepairData(newRepairData)
            
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

            // 设置历史记录（如果有）
            if (Array.isArray(ticket.history)) {
              setHistory(ticket.history)
            } else {
              setHistory([])
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
  }, [taskId]);
  
  // 从 user context 获取报告人的头像（电话现在来自工单的报告人信息）
  useEffect(() => {
    if (user) {
      setReporterAvatar(user.avatar || "/placeholder-user.jpg");
    } else {
      // 如果不是当前登录用户，使用默认头像
      setReporterAvatar("/placeholder-user.jpg");
    }
  }, [user]);
  
  // 判断是否需要补录 SN（ProductSN 为 "PENDING" 或 NULL 或空字符串）
  const needsSupplementSN = !repairData.productSN || 
                            repairData.productSN.trim() === "" || 
                            repairData.productSN.toUpperCase() === "PENDING" ||
                            repairData.deviceSerialNumber.toUpperCase() === "PENDING"

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
  
  // 保存维修工作台数据
  const handleSaveRepair = async () => {
    // 如果是返厂模式，需要验证供应商名称
    if (isOutsourced && !repairFormData.supplierName.trim()) {
      alert("返厂申请需要填写供应商名称")
      return
    }
    
    // 如果是复检模式，需要验证故障点
    if (isRecheckMode && !repairFormData.faultPoint.trim()) {
      alert("复检模式需要填写故障点")
      return
    }
    
    setIsSavingRepair(true)
    try {
      const requestBody: any = {}
      
      // 如果是返厂模式
      if (isOutsourced) {
        requestBody.supplierName = repairFormData.supplierName
        requestBody.status = "Pending_Factory"
      } else if (isRecheckMode) {
        // 复检模式：填写故障点后流转到 Admin_Review
        requestBody.faultPoint = repairFormData.faultPoint
        requestBody.materialCode = repairFormData.materialCode
        requestBody.deviceName = repairFormData.deviceName
        requestBody.fullSpec = repairFormData.fullSpec
        // 状态会自动流转到 Admin_Review（通过后端逻辑）
      } else {
        // 正常维修模式
        requestBody.materialCode = repairFormData.materialCode
        requestBody.deviceName = repairFormData.deviceName
        requestBody.fullSpec = repairFormData.fullSpec
        requestBody.faultPoint = repairFormData.faultPoint
        // 维修人员填写收费金额（根据业务逻辑：质保期内填0，过保填写金额）
        requestBody.repairCost = repairFormData.repairCost || 0
        requestBody.factoryRepairDate = repairFormData.factoryRepairDate?.toISOString()
        requestBody.factoryTrackingNum = repairFormData.factoryTrackingNum
        requestBody.supplierName = repairFormData.supplierName
        
        // 检查是否所有必填字段都已填写，如果是则自动流转到下一步
        const currentStep = getCurrentStep(repairData.status || "Created")
        if (currentStep) {
          const updatedTicket = { ...repairData, ...requestBody }
          const progress = calculateProgress(updatedTicket, currentStep)
          if (progress.canProceed && progress.nextStep) {
            // 自动流转到下一步
            requestBody.status = progress.nextStep.status
          }
        }
      }
      
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
          status: isOutsourced ? "Pending_Factory" : (isRecheckMode ? "Admin_Review" : repairData.status),
        })
        alert(isOutsourced ? "返厂申请已提交" : (isRecheckMode ? "复检完成，工单已流转至商务处理" : "维修记录保存成功"))
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
        if (result.data?.statusChanged && result.data?.newStatus === "Completed") {
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
  
  // 处理开始维修按钮点击
  const handleStartRepair = async () => {
    // 如果 SN 未补录，不允许开始维修
    if (needsSupplementSN) {
      alert("⚠️ 必须先补录设备序列号才能进行维修操作")
      return
    }
    try {
      const response = await fetch(`/api/tickets/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'In_Repair' }),
      });

      const result = await response.json();
      if (result.success) {
        setRepairData({...repairData, status: "in_repair"});
        
        // 发送通知给现场报告人员
        if (repairData.reporter) {
          addNotification({
            type: "repair_started",
            title: "维修已开始",
            message: `您报修的设备"${repairData.deviceName || repairData.deviceModel}"已开始维修`,
            repairId: taskId,
            deviceName: repairData.deviceName,
            deviceModel: repairData.deviceModel,
            status: "in_repair",
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
  };
  
  // 处理维修完成按钮点击
  const handleCompleteRepair = async () => {
    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed', id: taskId }),
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
          type: "ticket_scrapped",
          title: "工单已报废",
          message: `工单 ${taskId} 已被判定为报废`,
          repairId: taskId,
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
          type: "ticket_return_unrepaired",
          title: "工单已标记为拒修退回",
          message: `工单 ${taskId} 已标记为拒修退回，仓库将处理发货`,
          repairId: taskId,
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
          type: "cancel_request_submitted",
          title: "取消申请已提交",
          message: `您的取消申请已提交，等待商务人员审批`,
          repairId: taskId,
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
            cancelApprovedBy: user?.realName || user?.username || "",
            cancelApprovedDate: new Date()
          })
          addNotification({
            type: "cancel_request_approved",
            title: "取消申请已通过",
            message: `工单 ${taskId} 的取消申请已通过审批，工单已取消`,
            repairId: taskId,
          })
        } else {
          setRepairData({
            ...repairData, 
            cancelRequestStatus: "Rejected",
            cancelApprovedBy: user?.realName || user?.username || "",
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
          type: "ticket_cancelled",
          title: "工单已取消",
          message: `工单 ${taskId} 已被取消`,
          repairId: taskId,
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

  // 将工单移入回收站（软删除）
  const handleMoveToRecycleBin = async () => {
    if (!window.confirm("确定要删除这个工单吗？此操作会将工单移入回收站。")) {
      return
    }

    try {
      const response = await fetch(`/api/tickets/${taskId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deleteToRecycleBin: true, id: taskId }),
      })

      const result = await response.json()
      if (result.success) {
        // 更新本地状态为 deleted，并返回列表
        setRepairData({ ...repairData, status: "deleted" })
        alert("工单已移入回收站")
        onBack()
      } else {
        alert(result.message || "删除工单失败")
      }
    } catch (error) {
      console.error("删除工单失败:", error)
      alert("删除工单失败，请重试")
    }
  }

  // 延期申请状态
  const [isDelayDialogOpen, setIsDelayDialogOpen] = useState(false)
  
  // 判定报废相关状态
  const [isScrappedDialogOpen, setIsScrappedDialogOpen] = useState(false)
  const [scrappedReason, setScrappedReason] = useState("")
  
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
    switch (status) {
      case "created":
        return <Badge className="bg-warning/15 text-warning-foreground border-warning/30">待处理</Badge>
      case "in_repair":
        return <Badge className="bg-primary/15 text-primary border-primary/30">维修中</Badge>
      case "admin_review":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">待商务处理</Badge>
      case "pending_shipment":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300">待发货</Badge>
      case "completed":
        return <Badge className="bg-success/15 text-success border-success/30">已完成</Badge>
      case "delayed":
        return <Badge className="bg-destructive/15 text-destructive border-destructive/30">已申请延期</Badge>
      case "unrepairable":
        return <Badge className="bg-red-100 text-red-800 border-red-300">无法维修</Badge>
      // 兼容旧状态
      case "pending":
        return <Badge className="bg-warning/15 text-warning-foreground border-warning/30">待处理</Badge>
      case "processing":
        return <Badge className="bg-primary/15 text-primary border-primary/30">维修中</Badge>
      default:
        return <Badge className="bg-muted text-muted-foreground border-border">未知状态</Badge>
    }
  }

  // 获取快递公司名称
  const getExpressCompanyName = (id: string) => {
    const company = LOGISTICS.find(c => c.id === id)
    return company ? company.name : id
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
                <p className="text-xs text-muted-foreground">工单号: {repairData.id}</p>
                {getStatusBadge(repairData.status)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 只有维修工程师才能看到维修操作按钮 */}
            {user?.role === "technician" && (
              <div className="flex items-center gap-2">
                {(repairData.status === "created" || repairData.status === "pending") && (
                  <Button 
                    size="sm" 
                    onClick={handleStartRepair}
                    disabled={needsSupplementSN}
                  >
                    开始维修
                  </Button>
                )}
                {(repairData.status === "in_repair" || repairData.status === "processing" || repairData.status === "In_Repair") && (
                  <>
                    <Button 
                      size="sm" 
                      onClick={handleCompleteRepair} 
                      className="bg-green-600 hover:bg-green-700"
                      disabled={needsSupplementSN}
                    >
                      维修完成
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleUnrepairable} 
                      className="bg-red-600 hover:bg-red-700"
                      disabled={needsSupplementSN}
                    >
                      无法维修
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => setIsScrappedDialogOpen(true)} 
                      className="bg-red-800 hover:bg-red-900"
                      disabled={needsSupplementSN}
                    >
                      判定报废
                    </Button>
                  </>
                )}
                {/* 移入回收站按钮（任意状态都允许删除） */}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10"
                  onClick={handleMoveToRecycleBin}
                >
                  删除工单
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6">
        {/* 工作流进度显示 */}
        <WorkflowProgress ticket={repairData} showDetails={true} />
        
        {/* 只有维修工程师才能看到延期按钮 */}
        {(user?.role === "technician" && (repairData.status === "in_repair" || repairData.status === "processing")) && (
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
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="workbench">工作台</TabsTrigger>
            <TabsTrigger value="photos">照片凭证</TabsTrigger>
            <TabsTrigger value="history">处理记录</TabsTrigger>
            <TabsTrigger value="info">基础信息</TabsTrigger>
          </TabsList>
          
          <TabsContent value="workbench" className="mt-6 space-y-4">
            {/* 4个工作台板块 */}
            <Accordion type="multiple" defaultValue={["panel1"]} className="w-full">
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
                          {needsSupplementSN && (user?.role === "technician" || user?.role === "admin") ? (
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
                              {needsSupplementSN ? <span className="text-warning">待补录</span> : (repairData.productSN || "待录入")}
                            </p>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-sm text-muted-foreground">故障描述</Label>
                          <p className="font-medium mt-1 whitespace-pre-line">{repairData.faultDescription || "待录入"}</p>
                        </div>
                      </div>
                      
                      {/* 现场人员申请取消按钮 */}
                      {user?.role === "reporter" && repairData.status !== "Cancelled" && repairData.status !== "cancelled" && 
                       repairData.cancelRequestStatus !== "Approved" && repairData.cancelRequestStatus !== "Pending" && (
                        <div className="mt-6 pt-4 border-t">
                          <Button 
                            variant="outline" 
                            className="border-destructive text-destructive hover:bg-destructive/10"
                            onClick={() => setIsCancelRequestDialogOpen(true)}
                          >
                            申请取消维修订单
                          </Button>
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

              {/* 板块2：维修工作台（维修人员用） */}
              {(user?.role === "technician" || user?.role === "admin") && (
                <AccordionItem value="panel2">
                  <AccordionTrigger className="text-base font-semibold">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      <span>维修工作台</span>
                      {repairData.faultPoint && (
                        <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">已填写</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        {/* 复检模式提示 */}
                        {isRecheckMode && (
                          <Alert className="mb-4 border-orange-200 bg-orange-50">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            <AlertDescription className="text-orange-800">
                              📦 设备已从原厂返回，请进行最终检测并录入维修结果。
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {/* 返厂开关（仅在非复检模式且状态为 In_Repair 时显示） */}
                        {!isRecheckMode && (repairData.status === "In_Repair" || repairData.status === "in_repair" || repairData.status === "Processing" || repairData.status === "processing") && (
                          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-md border border-border mb-4">
                            <div className="flex items-center gap-2">
                              <Label htmlFor="isOutsourced" className="text-base font-medium cursor-pointer">
                                无法内修，需返厂 (Outsource)
                              </Label>
                            </div>
                            <Switch
                              id="isOutsourced"
                              checked={isOutsourced}
                              onCheckedChange={(checked) => setIsOutsourced(checked)}
                            />
                          </div>
                        )}
                        
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* 返厂模式下隐藏这些字段 */}
                          {!isOutsourced && !isRecheckMode && (
                            <>
                              <div>
                                <Label htmlFor="materialCode">物料代码</Label>
                                <Input
                                  id="materialCode"
                                  value={repairFormData.materialCode}
                                  onChange={(e) => setRepairFormData({ ...repairFormData, materialCode: e.target.value })}
                                  placeholder="待录入（可手动输入或从数据库获取）"
                                  className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  可手动输入，或点击下方"从数据库获取"按钮自动填充
                                </p>
                              </div>
                              <div>
                                <Label htmlFor="deviceName">物料名称（标准名）</Label>
                                <Input
                                  id="deviceName"
                                  value={repairFormData.deviceName}
                                  onChange={(e) => setRepairFormData({ ...repairFormData, deviceName: e.target.value })}
                                  placeholder="待录入（可手动输入或从数据库获取）"
                                  className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  可手动输入，或点击下方"从数据库获取"按钮自动填充
                                </p>
                              </div>
                              <div className="md:col-span-2">
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
                                      <RefreshCw className={cn("w-3 h-3 mr-1", isLoadingFullSpec && "animate-spin")} />
                                      {isLoadingFullSpec ? "获取中..." : "从数据库获取"}
                                    </Button>
                                  )}
                                </div>
                                <Input
                                  id="fullSpec"
                                  value={repairFormData.fullSpec}
                                  onChange={(e) => setRepairFormData({ ...repairFormData, fullSpec: e.target.value })}
                                  placeholder="待录入（可手动输入或从数据库获取）"
                                  className="mt-1"
                                />
                                {repairData.productSN && repairData.productSN !== "PENDING" && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    提示：可手动输入，或点击"从数据库获取"按钮自动填充（会同时填充物料代码、物料名称和规格型号）
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                          
                          {/* 复检模式或正常模式显示故障点 */}
                          {(isRecheckMode || !isOutsourced) && (
                            <div className="md:col-span-2">
                              <Label htmlFor="faultPoint">故障点 <span className="text-destructive">*</span></Label>
                              <Textarea
                                id="faultPoint"
                                value={repairFormData.faultPoint}
                                onChange={(e) => setRepairFormData({ ...repairFormData, faultPoint: e.target.value })}
                                placeholder={isRecheckMode ? "请详细描述复检结果和故障点..." : "请详细描述故障点..."}
                                className="mt-1 min-h-[100px]"
                                disabled={isOutsourced}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                {isRecheckMode 
                                  ? '填写故障点后，工单状态将自动流转为"待商务处理"'
                                  : '填写故障点后，工单状态将自动流转为"待商务处理"'}
                              </p>
                            </div>
                          )}
                          
                          {/* 复检模式显示物料信息 */}
                          {isRecheckMode && (
                            <>
                              <div>
                                <Label htmlFor="materialCode">物料代码</Label>
                                <Input
                                  id="materialCode"
                                  value={repairFormData.materialCode}
                                  onChange={(e) => setRepairFormData({ ...repairFormData, materialCode: e.target.value })}
                                  placeholder="待录入"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor="deviceName">物料名称（标准名）</Label>
                                <Input
                                  id="deviceName"
                                  value={repairFormData.deviceName}
                                  onChange={(e) => setRepairFormData({ ...repairFormData, deviceName: e.target.value })}
                                  placeholder="待录入"
                                  className="mt-1"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <Label htmlFor="fullSpec">规格型号</Label>
                                <Input
                                  id="fullSpec"
                                  value={repairFormData.fullSpec}
                                  onChange={(e) => setRepairFormData({ ...repairFormData, fullSpec: e.target.value })}
                                  placeholder="待录入"
                                  className="mt-1"
                                />
                              </div>
                            </>
                          )}
                          
                          {/* 正常模式显示收费金额（维修人员填写） */}
                          {!isOutsourced && !isRecheckMode && (
                            <>
                              <div>
                                <Label htmlFor="repairCost">收费金额（元）</Label>
                                <Input
                                  id="repairCost"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={repairFormData.repairCost || ""}
                                  onChange={(e) => {
                                    const value = e.target.value ? Number(e.target.value) : null
                                    setRepairFormData({ ...repairFormData, repairCost: value })
                                  }}
                                  placeholder="0.00（质保期内填0，过保填写金额）"
                                  className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {repairData.factoryShipDate 
                                    ? `出厂日期：${format(repairData.factoryShipDate, "yyyy-MM-dd", { locale: zhCN })}（请根据此日期判断是否在质保期内）`
                                    : "⚠️ 出厂日期未填写，请仓库管理员先填写出厂日期"}
                                </p>
                              </div>

                              {/* 收费金额下方的返厂信息（选填，不做强制校验） */}
                              <div className="grid md:grid-cols-3 gap-4 mt-4">
                                <div>
                                  <Label htmlFor="factoryRepairDate">返厂维修日期（选填）</Label>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        id="factoryRepairDate"
                                        variant="outline"
                                        className={cn("w-full justify-start text-left font-normal mt-1", !repairFormData.factoryRepairDate && "text-muted-foreground")}
                                      >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {repairFormData.factoryRepairDate ? (
                                          format(repairFormData.factoryRepairDate, "yyyy-MM-dd", { locale: zhCN })
                                        ) : (
                                          <span>选择日期</span>
                                        )}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent
                                        mode="single"
                                        selected={repairFormData.factoryRepairDate || undefined}
                                        onSelect={(date) => setRepairFormData({ ...repairFormData, factoryRepairDate: date || null })}
                                        initialFocus
                                        locale={zhCN}
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                <div>
                                  <Label htmlFor="factoryTrackingNum">返厂维修快递单号（选填）</Label>
                                  <Input
                                    id="factoryTrackingNum"
                                    value={repairFormData.factoryTrackingNum}
                                    onChange={(e) => setRepairFormData({ ...repairFormData, factoryTrackingNum: e.target.value })}
                                    placeholder="请输入快递单号"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="supplierName">供应商名称（选填）</Label>
                                  <Input
                                    id="supplierName"
                                    value={repairFormData.supplierName}
                                    onChange={(e) => setRepairFormData({ ...repairFormData, supplierName: e.target.value })}
                                    placeholder="请输入供应商名称"
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex justify-end pt-4 border-t">
                          <Button 
                            onClick={handleSaveRepair} 
                            disabled={
                              isSavingRepair || 
                              (isOutsourced && !repairFormData.supplierName.trim()) ||
                              ((isRecheckMode || !isOutsourced) && !repairFormData.faultPoint.trim())
                            }
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {isSavingRepair 
                              ? "保存中..." 
                              : isOutsourced 
                                ? "提交返厂申请"
                                : isRecheckMode
                                  ? "维修完成 (复检通过)"
                                  : "保存维修记录"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* 板块3：商务/管理员工作台 */}
              {(user?.role === "admin" || user?.role === "technician" || user?.role === "business") && (
                <AccordionItem value="panel3">
                  <AccordionTrigger className="text-base font-semibold">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      <span>商务/管理员工作台</span>
                      {user?.role === "technician" && (
                        <Badge variant="outline" className="ml-2">只读</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        {user?.role === "technician" && (
                          <div className="mb-4 p-3 bg-muted/50 rounded-md border border-border">
                            <p className="text-sm text-muted-foreground">
                              <AlertCircle className="inline h-4 w-4 mr-1" />
                              此工作台仅管理员和商务人员可编辑，维修人员仅可查看
                            </p>
                          </div>
                        )}
                        
                        {/* 显示待审批的取消申请 */}
                        {repairData.cancelRequestStatus === "Pending" && (user?.role === "admin" || user?.role === "business") && (
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
                            <div className="grid md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="adminFactoryRepairDate">发往原厂日期</Label>
                                {(user?.role === "admin" || user?.role === "business") ? (
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
                                {(user?.role === "admin" || user?.role === "business") ? (
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
                            {(user?.role === "admin" || user?.role === "business") && (repairData.status === "Pending_Factory" || repairData.status === "pending_factory") && (
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
                        
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* 管理员填写字段（根据新的业务逻辑） */}
                          <div className="flex items-center justify-between">
                            <Label htmlFor="isChargeable">是否收费（确认）</Label>
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                            <div className="md:col-span-2">
                              <Label htmlFor="clientName">客户名称（开票时必填）</Label>
                              {(user?.role === "admin" || user?.role === "business") ? (
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
                        {(user?.role === "admin" || user?.role === "business") && (
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
                        <div className="flex justify-end pt-4 border-t">
                          <Button onClick={handleSaveAdmin} disabled={isSavingAdmin}>
                            <Save className="w-4 h-4 mr-2" />
                            {isSavingAdmin ? "保存中..." : "更新商务信息"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* 板块4：物流发货工作台（仓库管理员用） */}
              {(user?.role === "admin" || user?.role === "technician") && (
                <AccordionItem value="panel4">
                  <AccordionTrigger className="text-base font-semibold">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      <span>物流发货工作台</span>
                      {user?.role === "technician" && (
                        <Badge variant="outline" className="ml-2">只读</Badge>
                      )}
                      {repairData.returnTrackingNum && (
                        <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">已发货</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        {user?.role === "technician" && (
                          <div className="mb-4 p-3 bg-muted/50 rounded-md border border-border">
                            <p className="text-sm text-muted-foreground">
                              <AlertCircle className="inline h-4 w-4 mr-1" />
                              此工作台仅管理员和商务人员可编辑，维修人员仅可查看
                            </p>
                          </div>
                        )}
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="receivedDate">收到日期</Label>
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                            {(user?.role === "admin" || user?.role === "business") ? (
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
                        {user?.role === "admin" && (
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

          <TabsContent value="info" className="mt-6 space-y-6">
            {/* 基础信息展示（兼容旧数据） */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* 设备信息 */}
              <Card className={cn(needsSupplementSN && "opacity-60")}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    设备信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">设备型号</Label>
                        <p className="font-medium">{repairData.deviceModel}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">设备名称</Label>
                        <p className="font-medium">{repairData.deviceName}</p>
                      </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm text-muted-foreground">设备序列号</Label>
                    <p className="font-medium">
                      {needsSupplementSN ? (
                        <span className="text-warning">待补录</span>
                      ) : (
                        repairData.deviceSerialNumber
                      )}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm text-muted-foreground">项目地点</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <p>{repairData.projectLocation}</p>
                    </div>
                  </div>
                  
                  {/* 保修状态 - 只在有保修数据时显示 */}
                  {repairData.inWarranty !== undefined && (
                    <div>
                      <Label className="text-sm text-muted-foreground">保修状态</Label>
                      <div className="flex items-center gap-2 mt-1">
                        {repairData.inWarranty ? (
                          <>
                            <ShieldCheck className="h-4 w-4 text-green-500" />
                            <p className="text-green-700">
                              在保修期内{repairData.warrantyEnd ? ` (截止日期: ${repairData.warrantyEnd})` : ''}
                            </p>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="h-4 w-4 text-red-500" />
                            <p className="text-red-700">已过保修期</p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Label className="text-sm text-muted-foreground">故障描述</Label>
                    <p className="mt-1 text-sm whitespace-pre-line">{repairData.repairReason}</p>
                  </div>
                </CardContent>
              </Card>

              {/* 快递物流信息 */}
              <Card className={cn(needsSupplementSN && "opacity-60")}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    快递物流信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">快递公司</Label>
                      <p className="font-medium">{getExpressCompanyName(repairData.expressCompany)}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">快递单号</Label>
                      <p className="font-medium">{repairData.trackingNumber}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 时间信息 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    时间信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">报修时间</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <ClockIcon className="h-4 w-4 text-muted-foreground" />
                        <p>{format(repairData.reportDate, "yyyy-MM-dd HH:mm", { locale: zhCN })}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-muted-foreground">期望完成时间</Label>
                        {/* 只有维修工程师且状态为处理中时，才能在这里申请延期 */}
                        {user?.role === "technician" && repairData.status === "processing" && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => setIsDelayDialogOpen(true)}
                          >
                            申请延期
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <p>{format(repairData.expectedCompletionDate, "yyyy年MM月dd日", { locale: zhCN })}</p>
                        {repairData.status === "delayed" && (
                          <Badge variant="outline" className="ml-2 text-xs">已申请延期</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 报告人信息 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    报告人信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={reporterAvatar} alt="报告人头像" />
                      <AvatarFallback>
                        {repairData.reporter?.substring(0, 2) || "用户"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <p className="font-medium text-lg">{repairData.reporter}</p>
                      <p className="text-sm text-muted-foreground">现场报告人员</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-primary/5 text-primary">
                          {repairData.department}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">联系电话</Label>
                    <p className="font-medium">{reporterPhone || "未设置"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
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
                      // 兼容处理：把数据库里可能的反斜杠 \ 都变成正斜杠 /（Windows 路径兼容）
                      const safePath = photo.replace(/\\/g, "/")
                      const src =
                        safePath.startsWith("http://") ||
                        safePath.startsWith("https://") ||
                        safePath.startsWith("/api/")
                          ? safePath
                          : `/api/images/${safePath.replace(/^\/+/, "")}`
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

            {/* 损坏细节照片 */}
            <Card>
              <CardHeader>
                <CardTitle>硬件损坏细节照片</CardTitle>
                <CardDescription>显示设备损坏部位的详细照片</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {repairData.damagePhotos.length > 0 ? (
                    repairData.damagePhotos.map((photo, index) => {
                      // 兼容处理：把数据库里可能的反斜杠 \ 都变成正斜杠 /（Windows 路径兼容）
                      const safePath = photo.replace(/\\/g, "/")
                      const src =
                        safePath.startsWith("http://") ||
                        safePath.startsWith("https://") ||
                        safePath.startsWith("/api/")
                          ? safePath
                          : `/api/images/${safePath.replace(/^\/+/, "")}`
                      return (
                        <div key={index} className="aspect-square rounded-lg overflow-hidden border border-border">
                          <img
                            src={src}
                            alt={`损坏细节照片 ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
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
                    <div className="md:col-span-3 p-8 text-center border border-dashed rounded-lg">
                      <p className="text-muted-foreground">暂无损坏细节照片</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>处理记录</CardTitle>
                <CardDescription>工单的处理历史记录</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* 工单创建记录 */}
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">工单创建</p>
                      <p className="text-sm text-muted-foreground">
                        {format(repairData.reportDate, "yyyy-MM-dd HH:mm", { locale: zhCN })}
                      </p>
                      <p className="text-sm">
                        {repairData.reporter} 报告了设备 {repairData.deviceId} 的故障
                      </p>
                    </div>
                  </div>

                  {/* 历史记录（从数据库读取） */}
                  {history.map((item, index) => {
                    const createdAt = new Date(item.createdAt)
                    const createdAtText = format(createdAt, "yyyy-MM-dd HH:mm", { locale: zhCN })

                    if (item.actionType === "Delay") {
                      const delayTo = item.delayTo ? new Date(item.delayTo) : repairData.expectedCompletionDate
                      return (
                        <div key={index} className="flex gap-4 items-start">
                          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                            <Calendar className="h-5 w-5 text-destructive" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium">申请延期</p>
                            <p className="text-sm text-muted-foreground">
                              {createdAtText}
                            </p>
                            {delayTo && (
                              <p className="text-sm">
                                维修工程师申请延期至 {format(delayTo, "yyyy年MM月dd日", { locale: zhCN })}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              原因: {item.delayReason || delayReason || "等待备件到货"}
                            </p>
                          </div>
                        </div>
                      )
                    }

                    if (item.actionType === "StatusChange") {
                      const newStatus = (item.newStatus || "").toLowerCase()
                      let title = "状态更新"
                      let description = ""

                      if (newStatus === "processing") {
                        title = "开始维修"
                        description = "维修工程师开始处理该工单"
                      } else if (newStatus === "completed") {
                        title = "维修完成"
                        description = "维修工程师已完成该工单的维修"
                      } else if (newStatus === "unrepairable") {
                        title = "无法维修"
                        description = "该设备被判定为无法维修"
                      } else if (newStatus === "deleted") {
                        title = "移入回收站"
                        description = "该工单已被移入回收站"
                      } else if (newStatus === "scrapped") {
                        title = "已报废"
                        description = "该工单已被判定为报废"
                      } else if (newStatus === "return_unrepaired") {
                        title = "拒修退回"
                        description = "客户拒修/原样退回"
                      } else if (newStatus === "cancelled") {
                        title = "已取消"
                        description = "该工单已被取消"
                      }

                      return (
                        <div key={index} className="flex gap-4 items-start">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Clock className="h-5 w-5 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium">{title}</p>
                            <p className="text-sm text-muted-foreground">
                              {createdAtText}
                            </p>
                            {description && (
                              <p className="text-sm text-muted-foreground">
                                {description}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    }

                    return null
                  })}
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