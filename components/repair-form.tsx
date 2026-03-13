"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { ArrowLeft, Camera, X, Search, CalendarIcon, Clock, AlertCircle, Upload, ShieldCheck, ShieldAlert, Plus, Copy, Trash2, Info, ZoomIn } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { format, isAfter, isBefore, parseISO } from "date-fns"
import { zhCN } from "date-fns/locale"
import { LOCATIONS, LOGISTICS } from "@/lib/mock-data"
import { useRepairContext } from "@/context/RepairContext"
import { useRouter } from "next/navigation"
import { useDeviceModels } from "@/hooks/use-device-models"
import { useDeviceCheck, DeviceCheckResult } from "@/hooks/use-device-check"
import { useAuth } from "@/context/auth-context"
import { FORM_LABELS, FORM_PLACEHOLDERS, FORM_ERRORS, TOAST_MESSAGES, INFO_MESSAGES, BUTTON_LABELS } from "@/lib/form-labels"
import { UserRole, WarrantyStatus, FaultCategory, RepairAction } from "@/lib/enums"
import { normalizeImageUrl } from "@/lib/storage/image-url-utils"

interface RepairFormProps {
  taskId: string | null
  onBack: () => void
  userType?: "technician" | "reporter"
  updateMode?: {
    enabled: boolean
    batchId: string
  }
  initialData?: {
    senderAddress?: string
    customerName?: string
    contactPerson?: string
    contactPhone?: string
    projectLocation?: string
    trackingNumber?: string
    expressCompany?: string
    category?: string
    subCategory?: string
    devices?: Array<{
      serialNumber: string
      faultDescription: string
      deviceName?: string
      deviceModel?: string
      category?: string
      subCategory?: string
      // 预填充时可能带有已保存的设备照片（JSON 字符串或字符串数组）
      deviceImages?: string | string[]
    }>
  }
}

export default function RepairForm({ taskId, onBack, userType = "reporter", updateMode, initialData }: RepairFormProps) {
  // 使用 RepairContext 和路由
  const { addRepair } = useRepairContext();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  // 设备信息状态
  const [deviceId, setDeviceId] = useState("")
  const [deviceSerialNumber, setDeviceSerialNumber] = useState("")
  const [deviceName, setDeviceName] = useState("")
  const [deviceModel, setDeviceModel] = useState("")
  const [materialCode, setMaterialCode] = useState("") // 物料代码（隐形存储）
  const [deviceValid, setDeviceValid] = useState<boolean | null>(null)
  const [deviceError, setDeviceError] = useState("")
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false)
  const [isInWarranty, setIsInWarranty] = useState<boolean | null>(null)
  const [warrantyInfo, setWarrantyInfo] = useState<{start?: string, end?: string} | null>(null)
  
  // 项目名称状态
  const [projectLocation, setProjectLocation] = useState(initialData?.projectLocation || "")
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
  const [filteredLocations, setFilteredLocations] = useState([])

  // 快递信息状态
  const [trackingNumber, setTrackingNumber] = useState(initialData?.trackingNumber || "")
  const [trackingNumberError, setTrackingNumberError] = useState("")
  const [expressCompany, setExpressCompany] = useState(initialData?.expressCompany || "")
  
  // 寄件人地址状态（完整地址输入框）
  const [senderAddress, setSenderAddress] = useState(initialData?.senderAddress || "") // 完整地址（包含省市区和详细地址）

  // 客户信息状态
  const [customerName, setCustomerName] = useState(initialData?.customerName || "") // 客户名称
  const [contactPerson, setContactPerson] = useState(initialData?.contactPerson || "") // 联系人姓名
  const [contactPhone, setContactPhone] = useState(initialData?.contactPhone || "") // 联系电话

  // 故障描述
  const [faultDescription, setFaultDescription] = useState("")

  // 日期时间状态
  const [reportDate] = useState<Date>(new Date())

  // 照片状态（用于预览的是图片 URL，真正上传的是 File 对象）- 保留用于兼容旧逻辑
  const [devicePhotos, setDevicePhotos] = useState<string[]>([])
  const [devicePhotoFile, setDevicePhotoFile] = useState<File | null>(null)
  const devicePhotoInputRef = useRef<HTMLInputElement>(null)
  
  // 表单提交状态
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false) // 标记是否已成功提交
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSnPendingVerify, setIsSnPendingVerify] = useState(false)
  
  // 批量创建工单相关状态
  const [quantity, setQuantity] = useState(1) // 数量选择（1-50）
  const [batchSerialNumbers, setBatchSerialNumbers] = useState<string[]>([]) // 批量序列号数组
  const [isBatchInputOpen, setIsBatchInputOpen] = useState(false) // 批量输入弹窗状态
  const [batchInputValues, setBatchInputValues] = useState<string[]>([]) // 批量输入框的值

  // 维修工作台 3W1H 相关状态（仅在 userType === 'technician' 时使用）
  const [warrantyStatusOverride, setWarrantyStatusOverride] = useState<WarrantyStatus | null>(null)
  const [faultCategory, setFaultCategory] = useState<FaultCategory | null>(null)
  const [repairAction, setRepairAction] = useState<RepairAction | null>(null)
  const [repairNotes, setRepairNotes] = useState("")
  const [rmaFactoryRepairDate, setRmaFactoryRepairDate] = useState<Date | null>(null)
  const [rmaFactoryTrackingNum, setRmaFactoryTrackingNum] = useState("")
  const [rmaSupplierName, setRmaSupplierName] = useState("")
  const [repairCost, setRepairCost] = useState<number | null>(null)
  const [batchInputErrors, setBatchInputErrors] = useState<Record<number, string>>({}) // 批量输入错误
  const [batchInputValidating, setBatchInputValidating] = useState<Record<number, boolean>>({}) // 批量输入验证状态
  const [batchInputValid, setBatchInputValid] = useState<Record<number, boolean | null>>({}) // 批量输入验证结果
  const batchDebounceTimers = useRef<Record<number, NodeJS.Timeout>>({}) // 批量输入防抖定时器

  // 历史客户信息
  interface CustomerHistoryItem {
    id: number
    customerName: string
    contactPerson: string | null
    contactPhone: string | null
    address: string | null
    lastUsedAt: Date
    useCount: number
  }
  const [customerHistory, setCustomerHistory] = useState<CustomerHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // 从后端获取设备型号列表（用于三级联动：Category / SubCategory / ModelName）
  const { models: deviceModels, loading: modelsLoading, error: modelsError } = useDeviceModels()

  // 获取历史客户信息
  useEffect(() => {
    const fetchCustomerHistory = async () => {
      setLoadingHistory(true)
      try {
        const response = await fetch('/api/customer-history', {
          headers: {
            'x-user-id': user?.userId?.toString() || '',
          },
        })
        const data = await response.json()
        if (data.success) {
          setCustomerHistory(data.data)
        }
      } catch (error) {
        console.error('获取历史客户失败:', error)
      } finally {
        setLoadingHistory(false)
      }
    }

    if (user?.userId) {
      fetchCustomerHistory()
    }
  }, [user?.userId])

  // 选择历史客户后自动填充
  const handleSelectCustomerHistory = (customer: CustomerHistoryItem) => {
    setCustomerName(customer.customerName)
    setContactPerson(customer.contactPerson || '')
    setContactPhone(customer.contactPhone || '')
    setSenderAddress(customer.address || '')
    toast({
      title: TOAST_MESSAGES.historySelected,
      description: `已填充：${customer.customerName} 的客户信息`,
    })
  }

  // 设备分类三级联动状态（单个设备，保留兼容）
  const [deviceCategory, setDeviceCategory] = useState("")
  const [deviceSubCategory, setDeviceSubCategory] = useState("")
  const [deviceModelSelected, setDeviceModelSelected] = useState("")

  // 多设备数组状态（每个设备独立的三级分类和序列号）
  interface DeviceInput {
    id: string
    category: string
    subCategory: string
    modelSelected: string
    serialNumber: string
    isSnPendingVerify: boolean
    // 序列号检索相关状态
    checkingSn: boolean
    snValid: boolean | null
    snError: string | null
    snData: DeviceCheckResult | null
    // 每个设备独立的故障信息和照片（支持最多 5 张）
    faultDescription: string
    devicePhotos: string[]       // 预览 URL 数组（blob: 新图 或 服务器 URL 既有图）
    devicePhotoFiles: File[]     // 待上传的新文件（与 blob: URL 一一对应）
  }
  const [deviceInputs, setDeviceInputs] = useState<DeviceInput[]>([
    {
      id: `device-${Date.now()}`,
      category: "",
      subCategory: "",
      modelSelected: "",
      serialNumber: "",
      isSnPendingVerify: false,
      checkingSn: false,
      snValid: null,
      snError: null,
      snData: null,
      faultDescription: "",
      devicePhotos: [],
      devicePhotoFiles: [],
    }
  ])

  // 预填充初始数据
  useEffect(() => {
    if (initialData?.devices && initialData.devices.length > 0) {
      const prefilledDevices = initialData.devices.map((device, index) => ({
        id: `device-prefilled-${Date.now()}-${index}`,
        category: device.category || initialData.category || "",
        subCategory: device.subCategory || initialData.subCategory || "",
        modelSelected: device.deviceModel || "",
        serialNumber: device.serialNumber || "",
        isSnPendingVerify: false,
        checkingSn: false,
        snValid: null,
        snError: null,
        snData: null,
        faultDescription: device.faultDescription || "",
        devicePhotos: (() => {
          // 解析既有照片 URL，编辑时直接展示
          if (!device.deviceImages) return []
          if (Array.isArray(device.deviceImages)) return device.deviceImages
          try {
            const parsed = JSON.parse(device.deviceImages as string)
            return Array.isArray(parsed) ? parsed : [parsed]
          } catch {
            return [device.deviceImages as string]
          }
        })(),
        devicePhotoFiles: [],
      }))
      setDeviceInputs(prefilledDevices)
    }
  }, []) // 只在组件挂载时执行一次

  // 添加新设备输入框
  const handleAddDevice = () => {
    setDeviceInputs([
      ...deviceInputs,
      {
        id: `device-${Date.now()}-${Math.random()}`,
        category: "",
        subCategory: "",
        modelSelected: "",
        serialNumber: "",
        isSnPendingVerify: false,
        checkingSn: false,
        snValid: null,
        snError: null,
        snData: null,
        faultDescription: "",
        devicePhotos: [],
        devicePhotoFiles: [],
      }
    ])
  }

  // 复制上一行设备信息
  const handleCopyLastDevice = () => {
    if (deviceInputs.length === 0) {
      handleAddDevice()
      return
    }
    const lastDevice = deviceInputs[deviceInputs.length - 1]
    
    // 检查上一个设备是否有分类信息
    if (!lastDevice.category) {
      toast({
        title: "提示",
        description: TOAST_MESSAGES.copyDeviceError,
        variant: "destructive",
      })
      handleAddDevice()
      return
    }
    
    // 创建新设备时，完整复制上一个设备的分类信息
    const newDevice: DeviceInput = {
      id: `device-${Date.now()}-${Math.random()}`,
      category: lastDevice.category,
      subCategory: lastDevice.subCategory,
      modelSelected: lastDevice.modelSelected,
      serialNumber: "", // 序列号不复制，必须唯一
      isSnPendingVerify: false,
      checkingSn: false,
      snValid: null,
      snError: null,
      snData: null,
      faultDescription: lastDevice.faultDescription, // 复制故障描述
      devicePhotos: [],    // 照片不复制
      devicePhotoFiles: [],
    }
    
    setDeviceInputs([...deviceInputs, newDevice])
    
    // 显示复制成功提示
    toast({
      title: TOAST_MESSAGES.copyDeviceSuccess,
      description: `已复制分类信息：${lastDevice.category} > ${lastDevice.subCategory || '未选择'} > ${lastDevice.modelSelected || '未选择'}`,
    })
    
    // 在控制台输出详细信息，方便调试
    console.log('✅ 复制设备信息成功:', {
      原设备ID: lastDevice.id,
      新设备ID: newDevice.id,
      复制的分类: {
        一级分类: newDevice.category,
        二级分类: newDevice.subCategory,
        型号: newDevice.modelSelected,
        故障描述: newDevice.faultDescription,
      }
    })
  }

  // 序列号检索防抖定时器（每个设备独立）
  const snCheckTimers = useRef<Record<string, NodeJS.Timeout>>({})

  // 为每个设备添加序列号检索功能
  useEffect(() => {
    deviceInputs.forEach((device) => {
      // 清除之前的定时器
      if (snCheckTimers.current[device.id]) {
        clearTimeout(snCheckTimers.current[device.id])
      }

      // 如果序列号为空或正在验证中，不检索
      if (!device.serialNumber || device.serialNumber.trim() === "" || device.isSnPendingVerify) {
        setDeviceInputs(prev => prev.map(d => 
          d.id === device.id 
            ? { ...d, checkingSn: false, snValid: null, snError: null, snData: null }
            : d
        ))
        return
      }

      // 设置防抖定时器
      snCheckTimers.current[device.id] = setTimeout(async () => {
        try {
          // 设置正在检索状态
          setDeviceInputs(prev => prev.map(d => 
            d.id === device.id 
              ? { ...d, checkingSn: true, snError: null }
              : d
          ))

          const res = await fetch(`/api/device/check?sn=${encodeURIComponent(device.serialNumber.trim())}`)
          if (!res.ok) {
            const json = await res.json().catch(() => ({}))
            throw new Error(json.message || "查询设备信息失败")
          }

          const json = await res.json()
          if (json.exists) {
            const deviceData = json.data as DeviceCheckResult
            
            // 序列号验证通过，保存设备信息（仅用于显示和内部记录）
            // 注意：不自动填充型号到三级下拉框
            // 原因：Device_Inventory存储的是内部型号，Product_Catalog是客户型号，两者不同
            // 用户必须手动从三级下拉框选择客户型号
            const updatedDevice = { 
              ...device, 
              snValid: true, 
              snData: deviceData, 
              checkingSn: false 
            }
            
            // 更新状态（不修改 category/subCategory/modelSelected）
            setDeviceInputs(prev => prev.map(d => 
              d.id === device.id ? updatedDevice : d
            ))
          } else {
            setDeviceInputs(prev => prev.map(d => 
              d.id === device.id 
                ? { ...d, snValid: false, snData: null, checkingSn: false }
                : d
            ))
          }
        } catch (err: any) {
          console.error(`设备 ${device.id} 序列号校验失败:`, err)
          setDeviceInputs(prev => prev.map(d => 
            d.id === device.id 
              ? { ...d, snValid: false, snError: err?.message || "设备校验失败", snData: null, checkingSn: false }
              : d
          ))
        }
      }, 600) // 600ms 防抖
    })

    // 清理函数
    return () => {
      Object.values(snCheckTimers.current).forEach((timer) => {
        if (timer) clearTimeout(timer)
      })
    }
  }, [deviceInputs.map(d => `${d.id}:${d.serialNumber}:${d.isSnPendingVerify}`).join("|"), deviceModels])

  // 删除设备输入框
  const handleRemoveDevice = (deviceId: string) => {
    if (deviceInputs.length > 1) {
      setDeviceInputs(deviceInputs.filter(d => d.id !== deviceId))
    }
  }

  // 更新设备信息
  const updateDeviceInput = (deviceId: string, field: keyof DeviceInput, value: string | boolean | DeviceCheckResult | null) => {
    setDeviceInputs(deviceInputs.map(device => 
      device.id === deviceId ? { ...device, [field]: value } : device
    ))
  }

  // 由产品目录构建选项
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    deviceModels.forEach((m) => {
      const c = (m.category || "").trim()
      if (c) set.add(c)
    })
    return Array.from(set)
  }, [deviceModels])

  const subCategoryOptions = useMemo(() => {
    if (!deviceCategory) return []
    const set = new Set<string>()
    deviceModels
      .filter((m) => (m.category || "").trim() === deviceCategory)
      .forEach((m) => {
        const s = (m.subCategory || "").trim()
        if (s) set.add(s)
      })
    return Array.from(set)
  }, [deviceModels, deviceCategory])

  const modelOptions = useMemo(() => {
    if (!deviceCategory || !deviceSubCategory) return []
    return deviceModels.filter(
      (m) =>
        (m.category || "").trim() === deviceCategory &&
        (m.subCategory || "").trim() === deviceSubCategory
    )
  }, [deviceModels, deviceCategory, deviceSubCategory])

  // 省市区选项计算

  // 在库警告弹窗状态
  const [showInStockWarning, setShowInStockWarning] = useState(false)
  const [pendingSerialNumber, setPendingSerialNumber] = useState("")

  // 根据序列号查询设备信息（带防抖）
  const {
    exists: deviceExists,
    data: checkedDevice,
    loading: checkingDevice,
    error: checkError,
    warning: deviceWarning,
  } = useDeviceCheck(deviceSerialNumber, 600)

  // 根据校验结果自动填充设备信息
  useEffect(() => {
    if (!deviceSerialNumber) {
      setDeviceValid(null)
      setDeviceError("")
      setIsInWarranty(null)
      setWarrantyInfo(null)
      return
    }

    if (checkError) {
      setDeviceValid(null)
      setDeviceError(checkError)
      setIsInWarranty(null)
      setWarrantyInfo(null)
      return
    }

    if (deviceExists === true && checkedDevice) {
      setDeviceValid(true)
      setDeviceError("")
      // 物料名称（DeviceName）是主要分类，优先使用
      setDeviceName(checkedDevice.deviceName || "")
      // 规格型号（ModelName）作为补充信息
      setDeviceModel(checkedDevice.modelName || "")
      // 物料代码（MaterialCode）隐形存储，提交时发送给后端
      setMaterialCode(checkedDevice.materialCode || "")
      
      // 如果在库警告，显示确认弹窗
      if (deviceWarning) {
        setShowInStockWarning(true)
        setPendingSerialNumber(deviceSerialNumber)
      }
      
      // 项目名称不再从数据库自动填充，由用户手动选择
      // 如后端返回保修信息，可在此设置 isInWarranty / warrantyInfo
    } else if (deviceExists === false) {
      setDeviceValid(false)
      setDeviceError("未找到匹配的设备序列号")
      setIsInWarranty(null)
      setWarrantyInfo(null)
      // 清空物料代码
      setMaterialCode("")
    }
  }, [deviceSerialNumber, deviceExists, checkedDevice, checkError, projectLocation])

  // 项目名称搜索过滤
  const handleProjectSearch = useCallback((value: string) => {
    setProjectLocation(value)
    if (LOCATIONS.length > 0) {
      const filtered = LOCATIONS.filter(location => 
        location.name.toLowerCase().includes(value.toLowerCase()) || 
        location.city.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredLocations(filtered)
    }
  }, [])

  // 快递单号验证（可选字段，只有输入时才验证格式）
  const validateTrackingNumber = useCallback((value: string) => {
    // 如果为空，不验证（允许为空）
    if (!value || value.trim() === '') {
      setTrackingNumberError("")
      return true
    }
    
    // 验证：仅允许字母或数字，长度8-30位（支持纯数字和字母+数字组合）
    const regex = /^[A-Za-z0-9]{8,30}$/
    if (!regex.test(value)) {
      setTrackingNumberError("无效的快递单号格式，应为8-30位的字母或数字组合")
      return false
    }
    
    setTrackingNumberError("")
    return true
  }, [])

  // 验证图片文件
  const validateImageFile = (file: File): { valid: boolean; error?: string } => {
    // 检查文件类型
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return { valid: false, error: '只支持 JPG、PNG、WEBP 格式的图片' }
    }
    
    // 检查文件大小（最大 5MB）
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return { valid: false, error: '图片大小不能超过 5MB' }
    }
    
    return { valid: true }
  }

  // 处理设备铭牌照片上传
  const handleAddDevicePhoto = () => {
    if (devicePhotoInputRef.current) {
      devicePhotoInputRef.current.click()
    }
  }

  const handleDevicePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件
    const validation = validateImageFile(file)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    // 使用 File 对象 + 预览 URL，不再转换为 base64
    setDevicePhotoFile(file)
    setDevicePhotos([URL.createObjectURL(file)])
    // 从错误对象中删除 devicePhotos 相关错误，而不是写入 undefined
    setFormErrors(prev => {
      const next = { ...prev }
      delete next.devicePhotos
      return next
    })

    // 清空 input，允许重复选择同一文件
    if (devicePhotoInputRef.current) {
      devicePhotoInputRef.current.value = ''
    }
  }


  // 处理拖拽上传
  const handleDevicePhotoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    setDevicePhotoFile(file)
    setDevicePhotos([URL.createObjectURL(file)])
    setFormErrors(prev => {
      const next = { ...prev }
      delete next.devicePhotos
      return next
    })
  }

  const handleRemoveDevicePhoto = (index: number) => {
    setDevicePhotos(devicePhotos.filter((_, i) => i !== index))
    setDevicePhotoFile(null)
  }

  // 表单验证
  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    // 验证多设备输入
    deviceInputs.forEach((device, index) => {
      if (!device.category) {
        errors[`device_${device.id}_category`] = `设备 ${index + 1}：${FORM_ERRORS.deviceCategoryRequired}`
      }
      if (!device.subCategory) {
        errors[`device_${device.id}_subCategory`] = `设备 ${index + 1}：${FORM_ERRORS.deviceSubCategoryRequired}`
      }
      if (!device.modelSelected) {
        errors[`device_${device.id}_modelSelected`] = `设备 ${index + 1}：${FORM_ERRORS.deviceModelRequired}`
      }
      
      // 验证设备序列号（必填；如果勾选"标签磨损/无法辨识"或选择无序列号产品则允许空）
      const isNoSerialProduct = device.category && (
        device.category.toLowerCase().includes("电源") || 
        device.category.toLowerCase().includes("开关") ||
        device.subCategory?.toLowerCase().includes("电源") ||
        device.subCategory?.toLowerCase().includes("开关")
      )
      
      if (!device.isSnPendingVerify && !isNoSerialProduct) {
        if (!device.serialNumber || device.serialNumber.trim() === "") {
          errors[`device_${device.id}_serialNumber`] = `设备 ${index + 1}：${FORM_ERRORS.deviceSerialNumberRequired}`
        }
      }

      // 验证故障描述 - 每个设备必填
      if (!device.faultDescription || device.faultDescription.trim().length < 3) {
        errors[`device_${device.id}_faultDescription`] = `设备 ${index + 1}：${FORM_ERRORS.faultDescriptionRequired}`
      }

      // 验证设备照片 - 只有在没有序列号（标签磨损/无法辨识）时才必填
      if (device.isSnPendingVerify && device.devicePhotos.length === 0) {
        errors[`device_${device.id}_devicePhoto`] = `设备 ${index + 1}：${FORM_ERRORS.devicePhotoRequired}`
      }
    })
    
    // 保留旧的验证逻辑（兼容）
    if (deviceInputs.length === 0) {
      if (!deviceCategory) {
        errors.deviceCategory = FORM_ERRORS.deviceCategoryRequired
      }
      if (!deviceSubCategory) {
        errors.deviceSubCategory = FORM_ERRORS.deviceSubCategoryRequired
      }
      if (!deviceModelSelected) {
        errors.deviceModelSelected = FORM_ERRORS.deviceModelRequired
      }
    }
    
    // 验证物流名称 - 必填
    if (!expressCompany || expressCompany.trim() === "") {
      errors.expressCompany = FORM_ERRORS.expressCompanyRequired
    }
    
    // 验证发出快递单号 - 必填
    if (!trackingNumber || trackingNumber.trim() === "") {
      errors.trackingNumber = FORM_ERRORS.trackingNumberRequired
    } else if (!validateTrackingNumber(trackingNumber)) {
      errors.trackingNumber = trackingNumberError || FORM_ERRORS.trackingNumberInvalid
    }
    
    // 验证客户名称 - 必填
    if (!customerName || customerName.trim() === "") {
      errors.customerName = FORM_ERRORS.customerNameRequired
    }
    
    // 验证联系人 - 必填
    if (!contactPerson || contactPerson.trim() === "") {
      errors.contactPerson = FORM_ERRORS.contactPersonRequired
    }
    
    // 验证联系电话 - 必填且格式验证
    if (!contactPhone || contactPhone.trim() === "") {
      errors.contactPhone = FORM_ERRORS.contactPhoneRequired
    } else if (!/^1[3-9]\d{9}$/.test(contactPhone.trim())) {
      errors.contactPhone = FORM_ERRORS.contactPhoneInvalid
    }
    
    // 验证项目名称 - 必须有输入
    if (!projectLocation) {
      errors.projectLocation = FORM_ERRORS.projectLocationRequired
    }
    
    // 验证寄件人地址 - 必须完整输入（包含省市区和详细地址）
    if (!senderAddress || senderAddress.trim().length < 10) {
      errors.senderAddress = FORM_ERRORS.senderAddressRequired
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // 表单提交
  const handleSubmit = async () => {
    // 防止重复提交
    if (isSubmitting || isSubmitted) {
      return
    }
    
    if (!validateForm()) {
      // 滚动到第一个错误
      const firstError = document.querySelector(".text-destructive")
      if (firstError) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      return
    }
    
    setIsSubmitting(true);
    
    try {
      // 🎯 更新模式：直接更新原工单
      if (updateMode?.enabled && updateMode?.batchId) {
        // 先上传所有设备的照片文件（如果有）
        const devicesWithPhotos = await Promise.all(
          deviceInputs.map(async (device, index) => {
            let deviceImages: string[] | undefined = undefined

            // 分离"既有服务器 URL"与"新 blob: URL"
            const existingUrls = device.devicePhotos.filter(p => !p.startsWith("blob:"))
            const newFiles    = device.devicePhotoFiles  // 与 blob: URL 一一对应

            // 并发上传所有新文件
            const uploadedUrls: string[] = []
            if (newFiles.length > 0) {
              const uploadResults = await Promise.all(
                newFiles.map(async (file) => {
                  try {
                    const formData = new FormData()
                    formData.append("file", file)
                    formData.append("type", "device_photo")
                    const res = await fetch("/api/upload", {
                      method: "POST",
                      body: formData,
                      credentials: "include",
                    })
                    const json = await res.json()
                    if (json.success && json.data?.filePath) return json.data.filePath as string
                    console.warn("照片上传失败:", json.message)
                    return null
                  } catch (err) {
                    console.error("上传照片时出错:", err)
                    return null
                  }
                })
              )
              uploadedUrls.push(...uploadResults.filter((u): u is string => u !== null))
            }

            const merged = [...existingUrls, ...uploadedUrls]
            if (merged.length > 0) {
              deviceImages = merged
            }

            return {
              serialNumber: device.isSnPendingVerify ? "待验证" : device.serialNumber,
              modelName: device.modelSelected || "通用型号",
              deviceName: device.snData?.deviceName || "",
              faultDescription: device.faultDescription,
              materialCode: device.snData?.materialCode || "",
              ...(deviceImages !== undefined && { deviceImages }), // 只在有照片时才包含此字段
            }
          })
        )

        const updateRequest: Record<string, unknown> = {
          senderAddress: senderAddress.trim(),
          projectName: customerName.trim(), // 客户名称
          contactInfo: `${contactPerson.trim()} ${contactPhone.trim()}`, // 联系人信息（格式："姓名 电话"）
          projectLocation: projectLocation.trim(), // 项目名称
          trackingNumber: trackingNumber.trim(),
          expressCompany: expressCompany.trim(),
          category: deviceInputs[0]?.category || "",
          subCategory: deviceInputs[0]?.subCategory || "",
          devices: devicesWithPhotos,
          // 维修工作台 3W1H 新字段（按批次维度保存）；故障分类已从 UI 移除，传空避免 API 校验异常
          warrantyStatusOverride: warrantyStatusOverride ?? null,
          faultCategory: faultCategory ?? null,
          repairAction: repairAction ?? null,
          repairNotes: repairNotes.trim() || null,
        }

        const response = await fetch(`/api/tickets/batch-update/${updateMode.batchId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateRequest),
        })

        const result = await response.json()

        if (!response.ok || !result?.success) {
          throw new Error(result?.message || "更新工单失败")
        }

        // 更新成功
        setIsSubmitting(false)
        setIsSubmitted(true)
        
        toast({
          title: "✅ 工单更新成功",
          description: `已更新 ${deviceInputs.length} 台设备`,
        })

        // 延迟1秒后返回
        setTimeout(() => {
          onBack()
        }, 1000)

        return
      }

      // 🎯 创建模式：正常创建新工单
      // 准备请求数据
      // 从 user context 获取用户ID（不再使用 localStorage）
      if (!user || !user.id) {
        toast({
          title: "提交失败",
          description: "用户信息无效，请重新登录",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }
      
      const userId = user.id

      // 为本次报修生成统一工单号（同一次提交中的所有设备共享）
      const workOrderNumber = `WO-${Date.now()}-${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`

      // 使用多设备输入数组创建工单
      // 优先使用 deviceInputs，如果没有则回退到旧的单个设备逻辑
      const devicesToSubmit = deviceInputs.length > 0 
        ? deviceInputs.map(device => ({
            serialNumber: device.isSnPendingVerify ? "待验证" : device.serialNumber,
            category: device.category,
            subCategory: device.subCategory,
            modelSelected: device.modelSelected,
            faultDescription: device.faultDescription,
            devicePhotoFiles: device.devicePhotoFiles,
          }))
        : quantity === 1 
          ? [{
              serialNumber: isSnPendingVerify ? "待验证" : deviceSerialNumber,
              category: deviceCategory,
              subCategory: deviceSubCategory,
              modelSelected: deviceModelSelected,
            }]
          : batchSerialNumbers.map(sn => ({
              serialNumber: sn,
              category: deviceCategory,
              subCategory: deviceSubCategory,
              modelSelected: deviceModelSelected,
            }))

      // 使用批量创建 API，将同一批次的设备关联到同一个 Batch
      // 准备批量创建的请求数据
      const batchRequest = {
        customerInfo: {
          name: customerName.trim(), // 客户名称
          contact: contactPerson.trim(), // 联系人
          phone: contactPhone.trim(), // 联系电话
          address: senderAddress.trim(), // 寄件人地址
          project: projectLocation, // 项目名称
        },
        items: devicesToSubmit.map((device, index) => {
          const deviceInput = deviceInputs[index]
          const snForSubmit = device.serialNumber
          
          return {
            productModel: device.modelSelected || deviceModel || "",
            deviceSn: snForSubmit,
            faultDesc: deviceInput?.faultDescription || device.faultDescription || faultDescription,
            category: device.category || "",
            subCategory: device.subCategory || "",
            quantity: quantity || 1, // 添加数量字段
            courierInfo: trackingNumber || "",
            courierCompany: expressCompany || "",
            materialCode: materialCode || "",
          }
        })
      }

      // 调用批量创建 API
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60秒超时
      
      let resp: Response
      try {
        resp = await fetch("/api/tickets/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batchRequest),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          throw new Error("请求超时，请检查网络连接")
        }
        throw new Error(`网络错误: ${fetchError.message || "无法连接到服务器"}`)
      }

      // 解析响应
      const result = await resp.json()
      
      if (!resp.ok || !result?.success) {
        throw new Error(result?.message || `批量创建工单失败 (HTTP ${resp.status})`)
      }

      const successCount = result.data?.count || devicesToSubmit.length
      const batchId = result.data?.batchId || ""

      // 上传设备照片并写入 DB（创建模式中照片独立处理）
      if (batchId) {
        const devicesWithPhotosForCreate = await Promise.all(
          deviceInputs.map(async (device) => {
            let deviceImages: string[] | undefined = undefined
            if (device.devicePhotoFiles.length > 0) {
              try {
                const uploadedUrls = await Promise.all(
                  device.devicePhotoFiles.map(async (file) => {
                    const photoFormData = new FormData()
                    photoFormData.append("file", file)
                    photoFormData.append("type", "device_photo")
                    const uploadResponse = await fetch("/api/upload", {
                      method: "POST",
                      body: photoFormData,
                      credentials: "include",
                    })
                    const uploadResult = await uploadResponse.json()
                    if (uploadResult.success && uploadResult.data?.filePath) {
                      return uploadResult.data.filePath as string
                    }
                    return null
                  })
                )
                const valid = uploadedUrls.filter((u): u is string => u !== null)
                if (valid.length > 0) deviceImages = valid
              } catch (uploadError) {
                console.error("创建模式：上传设备照片失败:", uploadError)
              }
            }
            return {
              serialNumber: device.isSnPendingVerify ? "待验证" : device.serialNumber,
              modelName: device.modelSelected || "通用型号",
              deviceName: device.snData?.deviceName || "",
              faultDescription: device.faultDescription,
              materialCode: device.snData?.materialCode || "",
              ...(deviceImages !== undefined && { deviceImages }),
            }
          })
        )
        const hasAnyPhotos = devicesWithPhotosForCreate.some((d) => d.deviceImages)
        if (hasAnyPhotos) {
          try {
            await fetch(`/api/tickets/batch-update/${batchId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                senderAddress: senderAddress.trim(),
                projectName: customerName.trim(),
                contactInfo: `${contactPerson.trim()} ${contactPhone.trim()}`,
                projectLocation: projectLocation.trim(),
                trackingNumber: trackingNumber.trim(),
                expressCompany: expressCompany.trim(),
                category: deviceInputs[0]?.category || "",
                subCategory: deviceInputs[0]?.subCategory || "",
                devices: devicesWithPhotosForCreate,
              }),
            })
          } catch (photoUpdateError) {
            console.error("创建模式：写入照片到工单失败:", photoUpdateError)
          }
        }
      }

      // 同步写入前端本地 RepairContext，方便页面立即更新列表
      const reportedBy = user.realName || user.id || "现场人员"

      // 将序列号转换为数字ID（简单哈希）
      const hashDeviceId = (str: string): number => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
      };

      // 将所有设备添加到前端 RepairContext
      devicesToSubmit.forEach((device, index) => {
        const deviceInput = deviceInputs[index]
        const snForSubmit = device.serialNumber
        
        addRepair({
          deviceId: hashDeviceId(snForSubmit),
          deviceName: deviceName,
          deviceModel: device.modelSelected || deviceModel,
          deviceSerialNumber: snForSubmit,
          problem: deviceInput?.faultDescription || device.faultDescription || faultDescription,
          status: "pending" as const,
          priority: "medium" as const,
          location: projectLocation,
          reportedBy: reportedBy,
          expressCompany: expressCompany,
          trackingNumber: trackingNumber,
          devicePhotos: deviceInput?.devicePhotos?.length ? deviceInput.devicePhotos : undefined,
        })
      })

      // 重置提交状态
      setIsSubmitting(false)
      setIsSubmitted(true)
      
      // 显示提交结果
      if (devicesToSubmit.length === 1) {
        alert("工单创建成功！")
      } else {
        alert(`✅ 批次工单创建成功！\n\n批次号：${batchId}\n设备数量：${successCount}台\n\n这些设备已关联到同一个批次工单中，可以统一管理。`)
      }
      
      // 用户确认后跳转（使用 setTimeout 确保状态更新后再跳转）
      setTimeout(() => {
        if (user?.role === UserRole.REPORTER) {
          router.replace("/report")
        } else {
          router.replace("/")
        }
      }, 100)
    } catch (error: any) {
      console.error("提交失败", error)
      console.error("错误详情:", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        cause: error?.cause,
      })
      
      // 如果是网络错误
      if (error instanceof TypeError && error.message.includes('fetch')) {
        alert("网络错误：无法连接到服务器，请检查网络连接后重试")
      } else {
        const errorMessage = error?.message || "提交失败，请稍后重试！"
        alert(`提交失败：${errorMessage}`)
      }
      
      setIsSubmitting(false)
    }
  }

  // 处理在库警告确认
  const handleInStockConfirm = () => {
    setShowInStockWarning(false)
    // 用户确认继续，不做任何操作，允许继续填写表单
  }

  const handleInStockCancel = () => {
    setShowInStockWarning(false)
    // 用户取消，清空序列号
    setDeviceSerialNumber("")
    setDeviceName("")
    setDeviceModel("")
    setMaterialCode("")
    setDeviceValid(null)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 在库警告弹窗 */}
      <Dialog open={showInStockWarning} onOpenChange={setShowInStockWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              设备状态提醒
            </DialogTitle>
            <DialogDescription className="pt-2">
              {deviceWarning || '该设备状态为"在库"，通常不需要报修，请确认是否继续？'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleInStockCancel}>
              取消
            </Button>
            <Button onClick={handleInStockConfirm}>
              确认继续
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="sticky top-0 bg-card border-b border-border z-10">
        <div className="flex items-center gap-3 p-4 md:p-6">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground">故障报修</h1>
            <p className="text-xs text-muted-foreground">请填写设备故障信息</p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-5 md:space-y-6">
        {/* 批次工单提示 */}
        {deviceInputs.length > 1 && (
          <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100/50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {deviceInputs.length}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 text-base mb-1">
                    批次工单模式
                  </h3>
                  <p className="text-sm text-blue-800">
                    您正在创建一个包含 <span className="font-bold">{deviceInputs.length}台设备</span> 的批次工单。提交后，所有设备将统一管理，共享相同的批次号、项目信息和快递信息。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          {/* Left Column */}
          <div className="space-y-5 md:space-y-6">
            {/* 设备信息 - 批次工单（可添加多个设备） */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base md:text-lg font-medium">设备信息</CardTitle>
                {deviceInputs.length > 1 && (
                  <Badge variant="default" className="bg-blue-600">
                    批次工单 ({deviceInputs.length}台)
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddDevice}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {BUTTON_LABELS.addDevice}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLastDevice}
                  className="flex items-center gap-2"
                  disabled={deviceInputs.length === 0}
                >
                  <Copy className="h-4 w-4" />
                  {BUTTON_LABELS.copyLastDevice}
                </Button>
              </div>
            </div>
            {deviceInputs.length > 1 && (
              <CardDescription className="text-xs mt-2 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span className="text-blue-800">
                  您正在创建一个包含 <span className="font-semibold">{deviceInputs.length}台设备</span> 的批次工单。这些设备将共享相同的项目信息、联系人和快递信息，提交后会生成一个统一的批次号。
                </span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {deviceInputs.map((device, deviceIndex) => {
              // 为每个设备计算二级分类和型号选项（在 map 中直接计算，不使用 useMemo）
              const deviceSubCategoryOptions = (() => {
                if (!device.category) return []
                const set = new Set<string>()
                deviceModels
                  .filter((m) => (m.category || "").trim() === device.category)
                  .forEach((m) => {
                    const s = (m.subCategory || "").trim()
                    if (s) set.add(s)
                  })
                return Array.from(set)
              })()

              const deviceModelOptions = (() => {
                if (!device.category || !device.subCategory) return []
                return deviceModels.filter(
                  (m) =>
                    (m.category || "").trim() === device.category &&
                    (m.subCategory || "").trim() === device.subCategory
                )
              })()

              return (
                <div key={device.id} className="border border-border rounded-lg p-4 space-y-4 relative">
                  {deviceInputs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveDevice(device.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      设备 {deviceIndex + 1}
                    </Badge>
                    {/* 调试信息：显示当前设备的分类状态 */}
                    {process.env.NODE_ENV === 'development' && device.category && (
                      <Badge variant="secondary" className="text-xs">
                        分类: {device.category} {device.subCategory && `> ${device.subCategory}`} {device.modelSelected && `> ${device.modelSelected}`}
                      </Badge>
                    )}
                  </div>
                  
                  {/* 设备分类三级联动 - 重新设计 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 一级分类 */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">
                        {FORM_LABELS.deviceCategory} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        key={`category-${device.id}-${device.category}`}
                        value={device.category}
                        onValueChange={(value) => {
                          console.log('一级分类选择:', { deviceId: device.id, oldValue: device.category, newValue: value })
                          const newInputs = deviceInputs.map(d => 
                            d.id === device.id 
                              ? { ...d, category: value, subCategory: "", modelSelected: "" }
                              : d
                          )
                          setDeviceInputs(newInputs)
                        }}
                      >
                        <SelectTrigger className="bg-muted/50 border-border w-full">
                          <SelectValue placeholder={modelsLoading ? INFO_MESSAGES.deviceCategoryLoading : FORM_PLACEHOLDERS.deviceCategory} />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryOptions.length === 0 && !modelsLoading && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              {INFO_MESSAGES.deviceCategoryEmpty}
                            </div>
                          )}
                          {categoryOptions.map((c) => (
                            <SelectItem key={`cat-${c}-${device.id}`} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 二级分类 */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">
                        {FORM_LABELS.deviceSubCategory} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        key={`subcategory-${device.id}-${device.category}-${device.subCategory}`}
                        value={device.subCategory}
                        onValueChange={(value) => {
                          console.log('二级分类选择:', { deviceId: device.id, oldValue: device.subCategory, newValue: value })
                          const newInputs = deviceInputs.map(d => 
                            d.id === device.id 
                              ? { ...d, subCategory: value, modelSelected: "" }
                              : d
                          )
                          setDeviceInputs(newInputs)
                        }}
                        disabled={!device.category || modelsLoading}
                      >
                        <SelectTrigger className="bg-muted/50 border-border w-full" disabled={!device.category || modelsLoading}>
                          <SelectValue placeholder={device.category ? FORM_PLACEHOLDERS.deviceSubCategory : INFO_MESSAGES.deviceSubCategorySelectFirst} />
                        </SelectTrigger>
                        <SelectContent>
                          {deviceSubCategoryOptions.length === 0 && device.category && !modelsLoading && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              {INFO_MESSAGES.deviceSubCategoryEmpty}
                            </div>
                          )}
                          {deviceSubCategoryOptions.map((s) => (
                            <SelectItem key={`subcat-${s}-${device.id}`} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 型号（三级分类） */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">
                        {FORM_LABELS.deviceModel} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        key={`model-${device.id}-${device.category}-${device.subCategory}-${device.modelSelected}`}
                        value={device.modelSelected}
                        onValueChange={(value) => {
                          console.log('型号选择:', { deviceId: device.id, oldValue: device.modelSelected, newValue: value })
                          const newInputs = deviceInputs.map(d => 
                            d.id === device.id 
                              ? { ...d, modelSelected: value }
                              : d
                          )
                          setDeviceInputs(newInputs)
                        }}
                        disabled={!device.category || !device.subCategory || modelsLoading}
                      >
                        <SelectTrigger className="bg-muted/50 border-border w-full" disabled={!device.category || !device.subCategory || modelsLoading}>
                          <SelectValue
                            placeholder={
                              !device.category ? INFO_MESSAGES.deviceSubCategorySelectFirst :
                              !device.subCategory ? INFO_MESSAGES.deviceModelSelectFirst : 
                              FORM_PLACEHOLDERS.deviceModel
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {deviceModelOptions.length === 0 && device.subCategory && !modelsLoading && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              当前分类下暂无型号，请在产品目录中维护
                            </div>
                          )}
                          {deviceModelOptions.map((m) => {
                            const modelName = m.name || m.code || String(m.id || "")
                            const modelValue = modelName.trim()
                            return (
                              <SelectItem
                                key={`model-${modelValue}-${device.id}`}
                                value={modelValue}
                              >
                                {modelName}
                              </SelectItem>
                            )
                          })}
                          <SelectItem value="通用型号">通用型号（无型号/通用）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* 设备序列号 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm text-muted-foreground">
                        设备序列号（SN）
                        {!device.isSnPendingVerify && <span className="text-destructive"> *</span>}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`sn-pending-${device.id}`}
                          checked={device.isSnPendingVerify}
                          onCheckedChange={(checked) => {
                            const newInputs = deviceInputs.map(d => 
                              d.id === device.id 
                                ? { 
                                    ...d, 
                                    isSnPendingVerify: Boolean(checked),
                                    serialNumber: checked ? "" : d.serialNumber,
                                    checkingSn: false,
                                    snValid: null,
                                    snError: null,
                                    snData: null,
                                  }
                                : d
                            )
                            setDeviceInputs(newInputs)
                          }}
                        />
                        <Label 
                          htmlFor={`sn-pending-${device.id}`}
                          className="text-xs text-muted-foreground cursor-pointer select-none"
                        >
                          标签磨损/无法辨识
                        </Label>
                      </div>
                    </div>
                    <Input
                      id={`serial-number-${device.id}`}
                      type="text"
                      value={device.serialNumber}
                      onChange={(e) => {
                        let cleaned = e.target.value.toUpperCase()
                        cleaned = cleaned.replace(/\s+/g, '')
                        const newInputs = deviceInputs.map(d => 
                          d.id === device.id 
                            ? { 
                                ...d, 
                                serialNumber: cleaned,
                                checkingSn: false,
                                snValid: null,
                                snError: null,
                                snData: null,
                              }
                            : d
                        )
                        setDeviceInputs(newInputs)
                      }}
                      placeholder={FORM_PLACEHOLDERS.deviceSerialNumber}
                      className={cn(
                        "bg-muted/50 border-border w-full",
                        device.snValid === true && "border-green-500",
                        device.snValid === false && "border-destructive"
                      )}
                      disabled={device.isSnPendingVerify}
                      autoComplete="off"
                    />
                    {device.isSnPendingVerify && (
                      <p className="text-xs text-amber-600 mt-1">
                        请在寄件包裹中注明本工单号，工程师收货后将核实并补录设备序列号。
                      </p>
                    )}
                    {/* 序列号检索状态显示 */}
                    {!device.isSnPendingVerify && device.serialNumber && device.serialNumber.trim() !== "" && (
                      <div className="mt-2">
                        {device.checkingSn && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            正在验证设备序列号...
                          </p>
                        )}
                        {!device.checkingSn && device.snValid === true && device.snData && (
                          <div className="p-2 rounded-md bg-green-50 border border-green-200">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-green-600" />
                              <span className="text-xs text-green-700 font-medium">设备验证成功</span>
                            </div>
                            {/* 型号和名称只对内部人员显示（非现场报告人员） */}
                            {user?.role !== UserRole.REPORTER && device.snData.modelName && (
                              <p className="text-xs text-green-600 mt-1">
                                型号: {device.snData.modelName}
                                {device.snData.deviceName && ` (${device.snData.deviceName})`}
                              </p>
                            )}
                            {user?.role !== UserRole.REPORTER && device.snData.location && (
                              <p className="text-xs text-green-600 mt-1">
                                位置: {device.snData.location}
                              </p>
                            )}
                          </div>
                        )}
                        {!device.checkingSn && device.snValid === false && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {device.snError || "未在爱克信设备库中找到该序列号"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 故障描述 - 每个设备独立 */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      故障描述 <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={device.faultDescription}
                      onChange={(e) => {
                        const newInputs = deviceInputs.map(d => 
                          d.id === device.id ? { ...d, faultDescription: e.target.value } : d
                        )
                        setDeviceInputs(newInputs)
                      }}
                      placeholder={FORM_PLACEHOLDERS.faultDescription}
                      className="min-h-[100px] bg-muted/50 border-border resize-none"
                    />
                  </div>

                  {/* 设备照片 — 多图上传，最多 5 张；无序列号时必填，有序列号时选填 */}
                  {(() => {
                    const MAX_PHOTOS = 5
                    const photoCount = device.devicePhotos.length
                    const canAdd = photoCount < MAX_PHOTOS
                    const isRequired = device.isSnPendingVerify

                    const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
                      const files = Array.from(e.target.files || [])
                      if (!files.length) return
                      // 过滤非图片
                      const validFiles = files.filter(f => f.type.startsWith('image/'))
                      if (validFiles.length === 0) { alert('请上传图片文件'); return }
                      // 计算还能加多少张
                      const remaining = MAX_PHOTOS - device.devicePhotos.length
                      const toAdd = validFiles.slice(0, remaining)
                      const newBlobUrls = toAdd.map(f => URL.createObjectURL(f))
                      setDeviceInputs(prev => prev.map(d =>
                        d.id === device.id
                          ? {
                              ...d,
                              devicePhotos: [...d.devicePhotos, ...newBlobUrls],
                              devicePhotoFiles: [...d.devicePhotoFiles, ...toAdd],
                            }
                          : d
                      ))
                      // 清空 input 以允许重复选同一文件
                      e.target.value = ''
                      // 清除验证错误
                      setFormErrors(prev => {
                        const next = { ...prev }
                        delete next[`device_${device.id}_devicePhoto`]
                        return next
                      })
                    }

                    const handleRemovePhoto = (photoIndex: number) => {
                      setDeviceInputs(prev => prev.map(d => {
                        if (d.id !== device.id) return d
                        const removedUrl = d.devicePhotos[photoIndex]
                        // 如果是 blob: URL，同步移除对应 File
                        let newFiles = d.devicePhotoFiles
                        if (removedUrl.startsWith('blob:')) {
                          const blobUrls = d.devicePhotos.filter(p => p.startsWith('blob:'))
                          const blobIdx = blobUrls.indexOf(removedUrl)
                          if (blobIdx !== -1) {
                            newFiles = d.devicePhotoFiles.filter((_, i) => i !== blobIdx)
                          }
                        }
                        return {
                          ...d,
                          devicePhotos: d.devicePhotos.filter((_, i) => i !== photoIndex),
                          devicePhotoFiles: newFiles,
                        }
                      }))
                    }

                    return (
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground flex justify-between">
                          <span>
                            设备照片{isRequired
                              ? <span className="text-destructive"> *</span>
                              : <span className="text-muted-foreground/60">（选填）</span>
                            }
                          </span>
                          <span className={cn("text-xs font-medium", photoCount >= MAX_PHOTOS ? "text-destructive" : "text-muted-foreground")}>
                            {photoCount}/{MAX_PHOTOS}
                          </span>
                        </Label>

                        {/* 多图预览 Grid */}
                        {photoCount > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {device.devicePhotos.map((url, photoIndex) => {
                              const imgSrc = url.startsWith('blob:') ? url : normalizeImageUrl(url)

                              /** 在新窗口打开黑底居中大图预览 */
                              const handleOpenPreview = (e: React.MouseEvent) => {
                                e.stopPropagation()
                                const win = window.open("", "_blank")
                                if (!win) return
                                win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>设备照片 ${photoIndex + 1}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    img { max-width: 100vw; max-height: 100vh; object-fit: contain; }
  </style>
</head>
<body><img src="${imgSrc}" alt="设备照片 ${photoIndex + 1}"/></body>
</html>`)
                                win.document.close()
                              }

                              return (
                                <div key={photoIndex} className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border group">
                                  <img
                                    src={imgSrc}
                                    alt={`设备照片 ${photoIndex + 1}`}
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={handleOpenPreview}
                                  />
                                  {/* 放大提示图标（悬停时显示，与删除按钮错开位置）*/}
                                  <div
                                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                  >
                                    <ZoomIn className="w-6 h-6 text-white drop-shadow-lg" />
                                  </div>
                                  {/* 悬停删除按钮 */}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleRemovePhoto(photoIndex) }}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 z-10"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  {/* 序号角标 */}
                                  <span className="absolute bottom-1 left-1 text-[10px] leading-none bg-black/50 text-white px-1 py-0.5 rounded pointer-events-none">
                                    {photoIndex + 1}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* 添加按钮（未达上限时显示）*/}
                        {canAdd && (
                          <>
                            <input
                              type="file"
                              multiple
                              accept="image/jpeg,image/jpg,image/png,image/webp"
                              onChange={handleAddPhotos}
                              className="hidden"
                              id={`device-photo-${device.id}`}
                            />
                            <div
                              onClick={() => document.getElementById(`device-photo-${device.id}`)?.click()}
                              className={cn(
                                "rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors",
                                photoCount > 0 ? "h-14" : "aspect-video"
                              )}
                            >
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Camera className={cn("shrink-0", photoCount > 0 ? "h-4 w-4" : "h-8 w-8")} />
                                <p className={cn("text-muted-foreground", photoCount > 0 ? "text-xs" : "text-sm")}>
                                  {photoCount > 0
                                    ? `继续添加（还可添加 ${MAX_PHOTOS - photoCount} 张）`
                                    : isRequired ? "点击上传设备照片" : "点击上传设备照片（可选）"
                                  }
                                </p>
                              </div>
                            </div>
                          </>
                        )}

                        {/* 验证错误提示 */}
                        {formErrors[`device_${device.id}_devicePhoto`] && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {formErrors[`device_${device.id}_devicePhoto`]}
                          </p>
                        )}
                      </div>
                    )
                  })()}
                  
                  {/* 每个设备卡片下方的快速添加按钮 */}
                  {deviceIndex === deviceInputs.length - 1 && (
                    <div className="flex gap-2 pt-3 border-t border-border/50 mt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddDevice}
                        className="flex items-center gap-2 flex-1"
                      >
                        <Plus className="h-4 w-4" />
                        添加设备
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyLastDevice}
                        className="flex items-center gap-2 flex-1"
                        disabled={deviceInputs.length === 0}
                      >
                        <Copy className="h-4 w-4" />
                        复制上一行
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
        
        {/* 保留原有的单个设备输入框（兼容旧逻辑，但隐藏） */}
        <div className="hidden">
                {/* 设备分类三级联动：Category / SubCategory / ModelName */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  一级分类 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={deviceCategory}
                  onValueChange={(value) => {
                    setDeviceCategory(value)
                    setDeviceSubCategory("")
                    setDeviceModelSelected("")
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "bg-muted/50 border-border",
                      formErrors.deviceCategory && "border-destructive"
                    )}
                  >
                    <SelectValue placeholder={modelsLoading ? "加载中..." : "选择分类"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.length === 0 && !modelsLoading && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        产品目录中暂无分类，请先导入数据
                      </div>
                    )}
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.deviceCategory && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {formErrors.deviceCategory}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  二级分类 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={deviceSubCategory}
                  onValueChange={(value) => {
                    setDeviceSubCategory(value)
                    setDeviceModelSelected("")
                  }}
                  disabled={!deviceCategory}
                >
                  <SelectTrigger
                    className={cn(
                      "bg-muted/50 border-border",
                      formErrors.deviceSubCategory && "border-destructive"
                    )}
                  >
                    <SelectValue placeholder={deviceCategory ? "选择子类" : "请先选择一级分类"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subCategoryOptions.length === 0 && deviceCategory && !modelsLoading && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        当前分类下暂无子类
                      </div>
                    )}
                    {subCategoryOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.deviceSubCategory && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {formErrors.deviceSubCategory}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  型号 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={deviceModelSelected}
                  onValueChange={(value) => {
                    setDeviceModelSelected(value)
                  }}
                  disabled={!deviceCategory || !deviceSubCategory}
                >
                  <SelectTrigger
                    className={cn(
                      "bg-muted/50 border-border",
                      formErrors.deviceModelSelected && "border-destructive"
                    )}
                  >
                    <SelectValue
                      placeholder={
                        !deviceSubCategory ? "请先选择二级分类" : "选择型号（如 AX-TRC2）"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.length === 0 && deviceSubCategory && !modelsLoading && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        当前分类下暂无型号，请在产品目录中维护
                      </div>
                    )}
                    {modelOptions.map((m) => (
                      <SelectItem
                        key={String(m.id ?? m.code ?? m.name)}
                        value={m.name || m.code || String(m.id)}
                      >
                        {m.name || m.code || String(m.id)}
                      </SelectItem>
                    ))}
                    {/* 通用型号：适用于出厂无具体型号或型号缺失的设备 */}
                    <SelectItem value="通用型号">通用型号（无型号/通用）</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.deviceModelSelected && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {formErrors.deviceModelSelected}
                  </p>
                )}
              </div>
            </div>

            {/* 数量选择器 - 强调批次概念 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="quantity" className="text-sm text-muted-foreground">
                  报修数量 <span className="text-destructive">*</span>
                </Label>
                {quantity > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    批次工单 ({quantity}台设备)
                  </Badge>
                )}
              </div>
              <Select
                value={quantity.toString()}
                onValueChange={(value) => {
                  const num = parseInt(value)
                  setQuantity(num)
                  // 如果数量改变，清空批量序列号
                  if (num === 1) {
                    setBatchSerialNumbers([])
                    setIsBatchInputOpen(false)
                  } else {
                    // 初始化批量输入数组
                    setBatchInputValues(new Array(num).fill(""))
                    setBatchInputErrors({})
                  }
                }}
              >
                <SelectTrigger id="quantity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 50 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num} {num > 1 ? '台（批次工单）' : '台（单个设备）'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {quantity > 1 && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-800">
                    <p className="font-medium mb-1">批次工单说明</p>
                    <p>您正在创建一个包含 <span className="font-semibold">{quantity}台设备</span> 的批次工单，这些设备将被统一管理，共享相同的项目信息、联系人和快递信息。</p>
                  </div>
                </div>
              )}
            </div>

            {/* 设备序列号 - 最后输入，用于匹配设备库存 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
              <Label htmlFor="deviceSerialNumber" className="text-sm text-muted-foreground">
                  设备序列号（SN） <span className="text-destructive">*</span>
              </Label>
                <div className="flex items-center gap-2">
                  {quantity === 1 ? (
                    <>
                      <Checkbox
                        id="pending-sn"
                        checked={isSnPendingVerify}
                        onCheckedChange={(checked) => {
                          const value = Boolean(checked)
                          setIsSnPendingVerify(value)
                          if (value) {
                            // 清空 SN，避免误用旧值并停止自动校验
                            setDeviceSerialNumber("")
                            setDeviceValid(null)
                            setDeviceError("")
                          }
                        }}
                      />
                      <Label
                        htmlFor="pending-sn"
                        className="text-xs text-muted-foreground cursor-pointer select-none"
                      >
                        标签磨损/无法辨识
                      </Label>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // 打开弹窗时，自动将已填写的序列号填充到前几个输入框中
                        const existingValues = new Array(quantity).fill("")
                        batchSerialNumbers.forEach((sn, index) => {
                          if (index < quantity) {
                            existingValues[index] = sn
                          }
                        })
                        setBatchInputValues(existingValues)
                        setIsBatchInputOpen(true)
                      }}
                      className="text-xs"
                    >
                      批量输入序列号
                    </Button>
                  )}
                </div>
              </div>
              {quantity === 1 ? (
                <>
                  <div className="relative">
                    <Input
                      id="deviceSerialNumber"
                      value={deviceSerialNumber}
                      onChange={(e) => {
                        // 输入清洗：只转大写，移除空格（保留横杠，因为有些序列号包含"-"）
                        let cleaned = e.target.value.toUpperCase()
                        cleaned = cleaned.replace(/\s+/g, '') // 只移除空格，保留横杠
                        setDeviceSerialNumber(cleaned);
                        // 设备序列号验证由 useDeviceCheck hook 自动处理
                      }}
                      placeholder={FORM_PLACEHOLDERS.deviceSerialNumber}
                      className={cn(
                        "bg-muted/50 border-border",
                        formErrors.deviceSerialNumber && "border-destructive"
                      )}
                      disabled={isSnPendingVerify}
                    />
                  </div>
                  {!isSnPendingVerify && checkingDevice && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      正在验证设备序列号...
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {/* 显示已输入的序列号（堆叠方式） */}
                  {batchSerialNumbers.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-md border border-border">
                      {batchSerialNumbers.slice(0, 10).map((sn, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {sn}
                        </Badge>
                      ))}
                      {batchSerialNumbers.length > 10 && (
                        <Badge variant="outline" className="text-xs">
                          +{batchSerialNumbers.length - 10} 个
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBatchSerialNumbers([])
                          setBatchInputValues(new Array(quantity).fill(""))
                          setBatchInputErrors({})
                        }}
                        className="h-6 px-2 text-xs"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {batchSerialNumbers.length === 0 && (
                    <div className="p-3 border border-dashed border-muted-foreground/30 rounded-md text-center">
                      <p className="text-sm text-muted-foreground">
                        已选择 {quantity} 个设备，请点击"批量输入序列号"按钮输入序列号
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {/* 保修状态显示 */}
              {!isSnPendingVerify && deviceValid && isInWarranty !== null && (
                <div className={`mt-2 p-2 rounded-md ${isInWarranty ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    {isInWarranty ? (
                      <>
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                        <span className="text-xs text-green-700">设备在保修期内</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-red-700">设备已过保修期</span>
                      </>
                    )}
                  </div>
                  {warrantyInfo && (
                    <div className="text-xs mt-1 text-muted-foreground">
                      保修期: {warrantyInfo.start} 至 {warrantyInfo.end}
                    </div>
                  )}
                </div>
              )}
              
              {!isSnPendingVerify && deviceValid === false && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {deviceError || "未在爱克信设备库中找到该序列号"}
                </p>
              )}
              {formErrors.deviceSerialNumber && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {formErrors.deviceSerialNumber}
                </p>
              )}
              {isSnPendingVerify && (
                <p className="text-xs text-amber-600 mt-1">
                  请在寄件包裹中注明本工单号，工程师收货后将核实并补录设备序列号。
                </p>
              )}
            </div>
            {/* 规格型号与物料名称在本页面不再展示，但仍通过 SN 自动填充到后端 */}
        </div>

          </div>

          {/* Right Column */}
          <div className="space-y-5 md:space-y-6">
            {/* 历史客户快速选择 */}
            {customerHistory.length > 0 && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {FORM_LABELS.selectHistory}
                    </Label>
                    <Select onValueChange={(value) => {
                      const customer = customerHistory.find(c => c.id.toString() === value)
                      if (customer) handleSelectCustomerHistory(customer)
                    }}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={FORM_PLACEHOLDERS.selectHistory} />
                      </SelectTrigger>
                      <SelectContent>
                        {customerHistory.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            <div className="flex flex-col items-start py-1">
                              <span className="font-medium">{customer.customerName}</span>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {customer.contactPerson && (
                                  <div>联系人：{customer.contactPerson}</div>
                                )}
                                {customer.contactPhone && (
                                  <div>电话：{customer.contactPhone}</div>
                                )}
                                {customer.address && (
                                  <div className="truncate max-w-[300px]">
                                    地址：{customer.address}
                                  </div>
                                )}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 客户信息 */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-medium">客户信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 客户名称 */}
                <div className="space-y-2">
                  <Label htmlFor="customerName" className="text-sm text-muted-foreground">
                    {FORM_LABELS.customerName} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={FORM_PLACEHOLDERS.customerName}
                    className={cn(
                      "bg-muted/50 border-border",
                      formErrors.customerName && "border-destructive"
                    )}
                  />
                  {formErrors.customerName && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.customerName}
                    </p>
                  )}
                </div>

                {/* 联系人姓名 */}
                <div className="space-y-2">
                  <Label htmlFor="contactPerson" className="text-sm text-muted-foreground">
                    {FORM_LABELS.contactPerson} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contactPerson"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder={FORM_PLACEHOLDERS.contactPerson}
                    className={cn(
                      "bg-muted/50 border-border",
                      formErrors.contactPerson && "border-destructive"
                    )}
                  />
                  {formErrors.contactPerson && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.contactPerson}
                    </p>
                  )}
                </div>

                {/* 联系电话 */}
                <div className="space-y-2">
                  <Label htmlFor="contactPhone" className="text-sm text-muted-foreground">
                    {FORM_LABELS.contactPhone} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder={FORM_PLACEHOLDERS.contactPhone}
                    maxLength={11}
                    className={cn(
                      "bg-muted/50 border-border",
                      formErrors.contactPhone && "border-destructive"
                    )}
                  />
                  {formErrors.contactPhone && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.contactPhone}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 项目名称 - 移到右侧平衡页面 */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-medium">项目名称</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="projectLocation" className="text-sm text-muted-foreground">
                    {FORM_LABELS.projectLocation} <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="projectLocation"
                      value={projectLocation}
                      onChange={(e) => setProjectLocation(e.target.value)}
                      placeholder={FORM_PLACEHOLDERS.projectLocation}
                      className={cn(
                        "pl-10 bg-muted/50 border-border",
                        formErrors.projectLocation && "border-destructive"
                      )}
                    />
                  </div>
                  
                  {formErrors.projectLocation && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.projectLocation}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 快递物流信息 */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-medium">快递物流信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 快递公司 - 手动输入 */}
                <div className="space-y-2">
                  <Label htmlFor="expressCompany" className="text-sm text-muted-foreground">
                    {FORM_LABELS.expressCompany} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="expressCompany"
                    value={expressCompany}
                    onChange={(e) => setExpressCompany(e.target.value)}
                    placeholder={FORM_PLACEHOLDERS.expressCompany}
                    className="bg-muted/50 border-border"
                  />
                  
                  {formErrors.expressCompany && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.expressCompany}
                    </p>
                  )}
                </div>

                {/* 发出快递单号（现场人员寄出设备时使用的单号） */}
                <div className="space-y-2">
                  <Label htmlFor="trackingNumber" className="text-sm text-muted-foreground">
                    {FORM_LABELS.trackingNumber} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="trackingNumber"
                    value={trackingNumber}
                    onChange={(e) => {
                      setTrackingNumber(e.target.value)
                      validateTrackingNumber(e.target.value)
                    }}
                    placeholder={FORM_PLACEHOLDERS.trackingNumber}
                    className={cn(
                      "bg-muted/50 border-border",
                      (trackingNumberError || formErrors.trackingNumber) && "border-destructive"
                    )}
                  />
                  {(trackingNumberError || formErrors.trackingNumber) && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {trackingNumberError || formErrors.trackingNumber}
                    </p>
                  )}
                </div>

                {/* 寄件人详细地址 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    {FORM_LABELS.senderAddress} <span className="text-destructive">*</span>
                  </Label>
                  
                  {/* 完整地址输入框 */}
                  <Input
                    placeholder={FORM_PLACEHOLDERS.senderAddress}
                    value={senderAddress}
                    onChange={(e) => setSenderAddress(e.target.value)}
                    className={cn(
                      "bg-muted/50 border-border",
                      formErrors.senderAddress && "border-destructive"
                    )}
                  />
                  
                  {/* 提示信息 */}
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{INFO_MESSAGES.senderAddressHint}</span>
                  </p>
                  
                  {formErrors.senderAddress && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.senderAddress}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ============ 维修工作台：故障与处理记录（仅维修工程师可见） ============ */}
        {userType === "technician" && (
          <div className="space-y-6 mt-8">
            <Card>
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

                {/* 故障点 + 处理说明：并排，数据独立（FaultPoint / RepairNotes） */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">故障点</Label>
                    <Textarea
                      value={faultDescription}
                      onChange={(e) => setFaultDescription(e.target.value)}
                      placeholder="请详细描述故障点或复检结果..."
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">处理说明</Label>
                    <Textarea
                      value={repairNotes}
                      onChange={(e) => setRepairNotes(e.target.value)}
                      placeholder="请简要描述本次维修过程、使用的手段、替换的部件等..."
                      className="min-h-[100px]"
                    />
                  </div>
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
                                !rmaFactoryRepairDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {rmaFactoryRepairDate
                                ? format(rmaFactoryRepairDate, "yyyy-MM-dd", { locale: zhCN })
                                : "选择日期"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={rmaFactoryRepairDate || undefined}
                              onSelect={(date) => setRmaFactoryRepairDate(date || null)}
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
                          value={rmaFactoryTrackingNum}
                          onChange={(e) => setRmaFactoryTrackingNum(e.target.value)}
                          placeholder="请输入返厂快递单号"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">供应商名称</Label>
                        <Input
                          value={rmaSupplierName}
                          onChange={(e) => setRmaSupplierName(e.target.value)}
                          placeholder="请输入供应商名称"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 区块三：物料与费用 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">物料与费用</CardTitle>
                <CardDescription>记录更换配件与收费信息</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">物料代码</Label>
                  <Input
                    value={materialCode}
                    onChange={(e) => setMaterialCode(e.target.value)}
                    placeholder="待录入（可手动输入或从数据库获取）"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">物料名称（标准名）</Label>
                  <Input
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="待录入"
                  />
                </div>
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label className="text-sm text-muted-foreground">规格型号</Label>
                  <Input
                    value={deviceModel}
                    onChange={(e) => setDeviceModel(e.target.value)}
                    placeholder="待录入"
                  />
                </div>
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label className="text-sm text-muted-foreground">收费金额（元）</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={repairCost ?? ""}
                    onChange={(e) => {
                      const value = e.target.value === "" ? null : Number(e.target.value)
                      setRepairCost(value)
                    }}
                    placeholder="0.00（质保期内填0，过保填写金额）"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Submit Button */}
        <div className="md:flex md:justify-end">
          <div className="fixed md:static bottom-20 md:bottom-auto left-0 md:left-auto right-0 md:right-auto p-4 md:p-0 bg-gradient-to-t from-background via-background to-transparent md:bg-none md:w-auto w-full md:max-w-none max-w-md mx-auto">
            <Button 
              className="w-full md:w-auto h-12 md:h-10 text-base font-medium px-8" 
              onClick={handleSubmit} 
              disabled={isSubmitting || isSubmitted || deviceInputs.length === 0 || deviceInputs.some(d => !d.category || !d.subCategory || !d.modelSelected || (!d.isSnPendingVerify && !d.serialNumber))}
            >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {deviceInputs.length === 1 ? "提交工单..." : `提交批次工单... (${deviceInputs.length}台设备)`}
            </span>
          ) : (
                deviceInputs.length === 1 ? "提交工单" : `提交批次工单 (${deviceInputs.length}台设备)`
          )}
        </Button>
          </div>
        </div>
      </div>

      {/* 批量输入序列号弹窗 */}
      <Dialog 
        open={isBatchInputOpen} 
        onOpenChange={(open) => {
          setIsBatchInputOpen(open)
          if (!open) {
            // 关闭弹窗时清理防抖定时器
            Object.values(batchDebounceTimers.current).forEach(timer => clearTimeout(timer))
            batchDebounceTimers.current = {}
            // 重置验证状态
            setBatchInputValidating({})
            setBatchInputValid({})
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>批量输入序列号 ({quantity} 个)</DialogTitle>
            <DialogDescription>
              请依次输入 {quantity} 个设备的序列号，型号等信息将自动应用到所有工单
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1 pr-2">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: quantity }, (_, index) => {
                // 验证序列号的函数
                const validateSerialNumber = async (sn: string, idx: number) => {
                  if (!sn || sn.trim() === "") {
                    setBatchInputValid(prev => ({ ...prev, [idx]: null }))
                    return
                  }

                  // 清除之前的定时器
                  if (batchDebounceTimers.current[idx]) {
                    clearTimeout(batchDebounceTimers.current[idx])
                  }

                  // 防抖：等待用户停止输入 600ms 后再验证
                  batchDebounceTimers.current[idx] = setTimeout(async () => {
                    setBatchInputValidating(prev => ({ ...prev, [idx]: true }))
                    setBatchInputErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors[idx]
                      return newErrors
                    })

                    try {
                      const res = await fetch(`/api/device/check?sn=${encodeURIComponent(sn.trim())}`)
                      if (!res.ok) {
                        const json = await res.json().catch(() => ({}))
                        throw new Error(json.message || "查询设备信息失败")
                      }

                      const json = await res.json()
                      if (json.exists) {
                        setBatchInputValid(prev => ({ ...prev, [idx]: true }))
                        // 清除该索引的错误
                        setBatchInputErrors(prev => {
                          const newErrors = { ...prev }
                          delete newErrors[idx]
                          return newErrors
                        })
                      } else {
                        setBatchInputValid(prev => ({ ...prev, [idx]: false }))
                      }
                    } catch (err: any) {
                      console.error("设备校验失败", err)
                      setBatchInputValid(prev => ({ ...prev, [idx]: null }))
                    } finally {
                      setBatchInputValidating(prev => ({ ...prev, [idx]: false }))
                    }
                  }, 600)
                }

                return (
                  <div key={index} className="space-y-1">
                    <Label htmlFor={`batch-sn-${index}`} className="text-sm">
                      序列号 {index + 1}
                    </Label>
                    <div className="relative">
                      <Input
                        id={`batch-sn-${index}`}
                        value={batchInputValues[index] || ""}
                        onChange={(e) => {
                          // 输入清洗：只转大写，移除空格
                          let cleaned = e.target.value.toUpperCase()
                          cleaned = cleaned.replace(/\s+/g, '')
                          
                          const newValues = [...batchInputValues]
                          newValues[index] = cleaned
                          setBatchInputValues(newValues)
                          
                          // 清除该索引的错误
                          if (batchInputErrors[index]) {
                            const newErrors = { ...batchInputErrors }
                            delete newErrors[index]
                            setBatchInputErrors(newErrors)
                          }

                          // 重置验证状态，开始新的验证
                          setBatchInputValid(prev => ({ ...prev, [index]: null }))
                          
                          // 实时验证
                          validateSerialNumber(cleaned, index)
                        }}
                        placeholder={`请输入第 ${index + 1} 个设备序列号`}
                        className={cn(
                          batchInputErrors[index] && "border-destructive",
                          batchInputValid[index] === false && "border-destructive",
                          batchInputValid[index] === true && "border-green-500"
                        )}
                      />
                      {batchInputValidating[index] && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin block" />
                        </div>
                      )}
                    </div>
                    {batchInputValidating[index] && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        正在验证序列号...
                      </p>
                    )}
                    {batchInputValid[index] === true && !batchInputValidating[index] && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        序列号验证通过
                      </p>
                    )}
                    {batchInputValid[index] === false && !batchInputValidating[index] && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        未在设备库中找到该序列号
                      </p>
                    )}
                    {batchInputErrors[index] && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {batchInputErrors[index]}
                      </p>
                    )}
                  </div>
                )
              })}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setIsBatchInputOpen(false)}>
              取消
            </Button>
            <Button
              onClick={async () => {
                // 验证所有序列号都已输入且验证通过
                const errors: Record<number, string> = {}
                const validSNs: string[] = []
                
                for (let i = 0; i < quantity; i++) {
                  const sn = (batchInputValues[i] || "").trim()
                  if (!sn) {
                    errors[i] = "请输入序列号"
                  } else if (batchInputValid[i] === false) {
                    errors[i] = "序列号未在设备库中找到，请检查后重试"
                  } else if (batchInputValid[i] === null && batchInputValidating[i]) {
                    errors[i] = "序列号正在验证中，请稍候"
                  } else if (batchInputValid[i] === true) {
                    validSNs.push(sn)
                  } else {
                    // 如果还没有验证结果，等待验证完成
                    errors[i] = "请等待序列号验证完成"
                  }
                }
                
                if (Object.keys(errors).length > 0) {
                  setBatchInputErrors(errors)
                  return
                }
                
                // 所有序列号都输入了且验证通过，保存并关闭弹窗
                setBatchSerialNumbers(validSNs)
                setIsBatchInputOpen(false)
                setBatchInputErrors({})
                // 清理防抖定时器
                Object.values(batchDebounceTimers.current).forEach(timer => clearTimeout(timer))
                batchDebounceTimers.current = {}
              }}
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}