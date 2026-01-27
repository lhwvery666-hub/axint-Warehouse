"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { ArrowLeft, Camera, X, Search, CalendarIcon, Clock, AlertCircle, Upload, ShieldCheck, ShieldAlert } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { format, isAfter, isBefore, parseISO } from "date-fns"
import { zhCN } from "date-fns/locale"
import { LOCATIONS, LOGISTICS } from "@/lib/mock-data"
import { useRepairContext } from "@/context/RepairContext"
import { useRouter } from "next/navigation"
import { useDeviceModels } from "@/hooks/use-device-models"
import { useDeviceCheck } from "@/hooks/use-device-check"
import { useAuth } from "@/context/auth-context"
import { CHINA_REGIONS, getProvinces, getCities, getDistricts } from "@/lib/china-regions"

interface RepairFormProps {
  taskId: string | null
  onBack: () => void
  userType?: "technician" | "reporter"
}

export default function RepairForm({ taskId, onBack, userType = "reporter" }: RepairFormProps) {
  // 使用 RepairContext 和路由
  const { addRepair } = useRepairContext();
  const { user } = useAuth();
  const router = useRouter();
  
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
  
  // 项目地点状态
  const [projectLocation, setProjectLocation] = useState("")
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
  const [filteredLocations, setFilteredLocations] = useState([])

  // 快递信息状态
  const [trackingNumber, setTrackingNumber] = useState("")
  const [trackingNumberError, setTrackingNumberError] = useState("")
  const [expressCompany, setExpressCompany] = useState("")
  
  // 寄件人地址状态（省市区三级联动）
  const [senderProvince, setSenderProvince] = useState("")
  const [senderCity, setSenderCity] = useState("")
  const [senderDistrict, setSenderDistrict] = useState("")
  const [senderDetailAddress, setSenderDetailAddress] = useState("") // 详细地址（街道、门牌号等）

  // 故障描述
  const [faultDescription, setFaultDescription] = useState("")

  // 日期时间状态
  const [reportDate] = useState<Date>(new Date())

  // 照片状态（用于预览的是图片 URL，真正上传的是 File 对象）
  const [devicePhotos, setDevicePhotos] = useState<string[]>([])
  const [damagePhotos, setDamagePhotos] = useState<string[]>([])
  const [devicePhotoFile, setDevicePhotoFile] = useState<File | null>(null)
  const [damagePhotoFiles, setDamagePhotoFiles] = useState<File[]>([])
  const devicePhotoInputRef = useRef<HTMLInputElement>(null)
  const damagePhotoInputRef = useRef<HTMLInputElement>(null)
  
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
  const [batchInputErrors, setBatchInputErrors] = useState<Record<number, string>>({}) // 批量输入错误
  const [batchInputValidating, setBatchInputValidating] = useState<Record<number, boolean>>({}) // 批量输入验证状态
  const [batchInputValid, setBatchInputValid] = useState<Record<number, boolean | null>>({}) // 批量输入验证结果
  const batchDebounceTimers = useRef<Record<number, NodeJS.Timeout>>({}) // 批量输入防抖定时器

  // 从后端获取设备型号列表（用于三级联动：Category / SubCategory / ModelName）
  const { models: deviceModels, loading: modelsLoading, error: modelsError } = useDeviceModels()

  // 设备分类三级联动状态
  const [deviceCategory, setDeviceCategory] = useState("")
  const [deviceSubCategory, setDeviceSubCategory] = useState("")
  const [deviceModelSelected, setDeviceModelSelected] = useState("")

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
  const provinceOptions = useMemo(() => getProvinces(), [])
  const cityOptions = useMemo(() => {
    if (!senderProvince) return []
    return getCities(senderProvince)
  }, [senderProvince])
  const districtOptions = useMemo(() => {
    if (!senderProvince || !senderCity) return []
    return getDistricts(senderProvince, senderCity)
  }, [senderProvince, senderCity])

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
      
      // 项目地点不再从数据库自动填充，由用户手动选择
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

  // 项目地点搜索过滤
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
    
    // 简单验证：字母和数字组合，长度至少8位
    const regex = /^[a-zA-Z0-9]{8,}$/
    if (!regex.test(value)) {
      setTrackingNumberError("无效的快递单号格式，应为至少8位的字母和数字组合")
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
    setFormErrors(prev => ({ ...prev, devicePhotos: undefined }))

    // 清空 input，允许重复选择同一文件
    if (devicePhotoInputRef.current) {
      devicePhotoInputRef.current.value = ''
    }
  }

  // 处理损坏细节照片上传
  const handleAddDamagePhoto = () => {
    if (damagePhotoInputRef.current) {
      damagePhotoInputRef.current.click()
    }
  }

  const handleDamagePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 检查是否已达到上限
    if (damagePhotos.length >= 3) {
      alert('最多只能上传 3 张损坏细节照片')
      return
    }

    // 验证文件
    const validation = validateImageFile(file)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    // 使用 File 对象 + 预览 URL
    setDamagePhotoFiles([...damagePhotoFiles, file])
    setDamagePhotos([...damagePhotos, URL.createObjectURL(file)])

    // 清空 input，允许重复选择同一文件
    if (damagePhotoInputRef.current) {
      damagePhotoInputRef.current.value = ''
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
    setFormErrors(prev => ({ ...prev, devicePhotos: undefined }))
  }

  const handleDamagePhotoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (damagePhotos.length >= 3) {
      alert('最多只能上传 3 张损坏细节照片')
      return
    }

    const validation = validateImageFile(file)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    setDamagePhotoFiles([...damagePhotoFiles, file])
    setDamagePhotos([...damagePhotos, URL.createObjectURL(file)])
  }

  const handleRemoveDevicePhoto = (index: number) => {
    setDevicePhotos(devicePhotos.filter((_, i) => i !== index))
    setDevicePhotoFile(null)
  }

  const handleRemoveDamagePhoto = (index: number) => {
    setDamagePhotos(damagePhotos.filter((_, i) => i !== index))
    setDamagePhotoFiles(damagePhotoFiles.filter((_, i) => i !== index))
  }

  // 表单验证
  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    // 验证三级联动分类
    if (!deviceCategory) {
      errors.deviceCategory = "请选择设备一级分类"
    }
    if (!deviceSubCategory) {
      errors.deviceSubCategory = "请选择设备二级分类"
    }
    if (!deviceModelSelected) {
      errors.deviceModelSelected = "请选择设备型号"
    }

    // 验证设备序列号（必填；如果勾选"标签磨损/无法辨识"或选择无序列号产品则允许空）
    // 检查是否为无序列号产品（如电源、开关等基础产品）
    const isNoSerialProduct = deviceCategory && (
      deviceCategory.toLowerCase().includes("电源") || 
      deviceCategory.toLowerCase().includes("开关") ||
      deviceSubCategory?.toLowerCase().includes("电源") ||
      deviceSubCategory?.toLowerCase().includes("开关")
    )
    
    if (quantity === 1) {
      if (!isSnPendingVerify && !isNoSerialProduct) {
        if (!deviceSerialNumber) {
          errors.deviceSerialNumber = "请输入设备序列号"
        } else if (deviceValid === false) {
          errors.deviceSerialNumber = deviceError || "设备序列号不存在"
        }
      }
    } else {
      // 批量模式：验证是否已输入所有序列号（无序列号产品除外）
      if (!isNoSerialProduct && batchSerialNumbers.length !== quantity) {
        errors.deviceSerialNumber = `请完成所有 ${quantity} 个序列号的输入`
      }
    }
    
    // 验证物流名称 - 必填
    if (!expressCompany || expressCompany.trim() === "") {
      errors.expressCompany = "请输入物流名称"
    }
    
    // 验证发出快递单号 - 必填
    if (!trackingNumber || trackingNumber.trim() === "") {
      errors.trackingNumber = "请输入发出快递单号"
    } else if (!validateTrackingNumber(trackingNumber)) {
      errors.trackingNumber = trackingNumberError || "请输入有效的快递单号（至少8位字母和数字组合）"
    }
    
    // 验证项目地点 - 必须有输入
    if (!projectLocation) {
      errors.projectLocation = "请输入项目地点"
    }
    
    // 验证寄件人地址 - 必须有输入
    if (!senderProvince || !senderCity || !senderDistrict) {
      errors.senderAddress = "请选择完整的省市区"
    }
    if (!senderDetailAddress || senderDetailAddress.trim().length < 5) {
      errors.senderAddress = "请输入详细地址（至少5个字符）"
    }
    
    // 验证故障描述 - 必须有输入
    if (!faultDescription || faultDescription.trim().length < 3) {
      errors.faultDescription = "请描述故障情况"
    }
    
    // 验证设备铭牌照片 - 必须有至少一张
    if (devicePhotos.length === 0) {
      errors.devicePhotos = "请上传设备铭牌照片"
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
      // 准备请求数据
      // 从 user context 获取用户ID（不再使用 localStorage）
      const userId = user?.id || null

      // 确定要创建的工单数量
      const serialNumbersToSubmit = quantity === 1 
        ? [isSnPendingVerify ? "PENDING_VERIFY" : deviceSerialNumber]
        : batchSerialNumbers

      // 批量创建工单
      let successCount = 0
      let failCount = 0
      const errors: string[] = []

      for (let i = 0; i < serialNumbersToSubmit.length; i++) {
        const snForSubmit = serialNumbersToSubmit[i]
        
        // 使用 FormData 发送表单和文件，避免 JSON 体积限制
        const formData = new FormData()
        formData.append("deviceSn", snForSubmit)
        formData.append("faultDesc", faultDescription)
        formData.append("courierInfo", trackingNumber || "")
        formData.append("courierCompany", expressCompany || "")
        formData.append("userId", userId ? String(userId) : "")
        formData.append("projectLocation", projectLocation)
        formData.append("materialCode", materialCode || "")
        
        // 组合完整的寄件人地址：省 + 市 + 区县 + 详细地址
        const provinceName = senderProvince ? CHINA_REGIONS.find(p => p.code === senderProvince)?.name || "" : ""
        const cityName = senderProvince && senderCity ? getCities(senderProvince).find(c => c.code === senderCity)?.name || "" : ""
        const districtName = senderProvince && senderCity && senderDistrict ? getDistricts(senderProvince, senderCity).find(d => d.code === senderDistrict)?.name || "" : ""
        const fullSenderAddress = [provinceName, cityName, districtName, senderDetailAddress].filter(Boolean).join(" ")
        formData.append("senderAddress", fullSenderAddress)

        // 设备分类信息（用于后端按 CSV 要求保存 Category / SubCategory / ModelName / ProductSN）
        formData.append("category", deviceCategory || "")
        formData.append("subCategory", deviceSubCategory || "")
        formData.append(
          "modelName",
          deviceModelSelected || deviceModel || ""
        )
        formData.append("productSn", snForSubmit)

        // 现场人员填报区字段（用于 Excel 导出）
        // TrackingNumber_In: 发出快递单号（现场人员寄出设备时使用的单号）
        formData.append("trackingNumberIn", trackingNumber || "")
        
        // ContactInfo: 联系人及电话（从用户信息获取）
        const contactInfo = user?.realName && user?.phone 
          ? `${user.realName} ${user.phone}` 
          : (user?.realName || user?.phone || "")
        formData.append("contactInfo", contactInfo)
        
        // ProjectName: 项目/客户名称（使用项目地点作为项目名称）
        formData.append("projectName", projectLocation || "")

        // 设备铭牌照片（必填，只取一张）
        if (devicePhotoFile) {
          formData.append("deviceImages", devicePhotoFile)
        }

        // 损坏细节照片（可多张）
        if (damagePhotoFiles.length > 0) {
          damagePhotoFiles.forEach((file) => {
            formData.append("damageImages", file)
          })
        }
        
        // 调用后端接口创建工单（写入 SQL Server）
        // 添加超时控制（30秒）
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)
        
        let resp: Response
        try {
          resp = await fetch("/api/tickets/create", {
            method: "POST",
            body: formData,
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
        } catch (fetchError: any) {
          clearTimeout(timeoutId)
          if (fetchError.name === 'AbortError') {
            failCount++
            errors.push(`序列号 ${snForSubmit}: 请求超时`)
            continue
          }
          failCount++
          errors.push(`序列号 ${snForSubmit}: ${fetchError.message || "网络错误"}`)
          continue
        }

        // 先读取响应文本，以便调试
        const responseText = await resp.text()
        const contentType = resp.headers.get("content-type") || ""
        
        let result: any = {}
        
        // 如果响应体为空
        if (!responseText || responseText.trim() === "") {
          failCount++
          errors.push(`序列号 ${snForSubmit}: 服务器返回了空响应`)
          continue
        }
        
        // 尝试解析 JSON
        if (contentType.includes("application/json") || responseText.trim().startsWith("{")) {
          try {
            result = JSON.parse(responseText)
          } catch (jsonError: any) {
            failCount++
            errors.push(`序列号 ${snForSubmit}: 服务器返回了无效的 JSON 响应`)
            continue
          }
        } else {
          failCount++
          errors.push(`序列号 ${snForSubmit}: 服务器返回了非 JSON 响应`)
          continue
        }

        // 检查响应是否成功
        if (!resp.ok) {
          const errorMessage = result?.message || result?.error || `HTTP ${resp.status}: ${resp.statusText}`
          failCount++
          errors.push(`序列号 ${snForSubmit}: ${errorMessage}`)
          continue
        }

        if (!result?.success) {
          const errorMessage = result?.message || result?.error || "创建工单失败（未知错误）"
          failCount++
          errors.push(`序列号 ${snForSubmit}: ${errorMessage}`)
          continue
        }

        successCount++

        // 同步写入前端本地 RepairContext，方便页面立即更新列表
        const reportedBy = user?.realName || user?.id || "现场人员"

        // 从设备校验结果获取设备信息（批量模式下需要重新查询）
        const deviceInfo = {
          serialNumber: snForSubmit,
          modelName: deviceModel,
          deviceName: deviceName,
          location: projectLocation,
        }

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

        // 添加到前端 RepairContext（用于立即显示在列表中）
        // 注意：不保存照片的 base64 数据到 localStorage，避免配额超出
        addRepair({
          deviceId: hashDeviceId(deviceInfo.serialNumber || snForSubmit),
          deviceName: deviceInfo.deviceName || deviceName,
          deviceModel: deviceInfo.modelName || deviceModel,
          deviceSerialNumber: snForSubmit,
          problem: faultDescription,
          status: "pending" as const,
          priority: "medium" as const,
          location: deviceInfo.location || projectLocation,
          reportedBy: reportedBy,
          expressCompany: expressCompany,
          trackingNumber: trackingNumber,
          // 不保存照片的 base64 数据，只保存数量信息（避免 localStorage 配额超出）
          devicePhotos: devicePhotos.length > 0 ? [`${devicePhotos.length} photos`] : undefined,
          damagePhotos: damagePhotos.length > 0 ? [`${damagePhotos.length} photos`] : undefined,
        })
      }

      // 重置提交状态
      setIsSubmitting(false)
      setIsSubmitted(true)
      
      // 显示批量提交结果
      if (quantity === 1) {
        alert("故障报告提交成功！")
      } else {
        if (successCount === quantity) {
          alert(`成功创建 ${successCount} 个工单！`)
        } else {
          alert(`创建完成：成功 ${successCount} 个，失败 ${failCount} 个。\n${errors.length > 0 ? errors.slice(0, 5).join('\n') : ''}${errors.length > 5 ? `\n...还有 ${errors.length - 5} 个错误` : ''}`)
        }
      }
      
      // 用户确认后跳转（使用 setTimeout 确保状态更新后再跳转）
      setTimeout(() => {
        if (user?.role === "reporter") {
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
        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          {/* Left Column */}
          <div className="space-y-5 md:space-y-6">
            {/* 设备信息 */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-medium">设备信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

            {/* 数量选择器 */}
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-sm text-muted-foreground">
                数量
              </Label>
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
                      {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      placeholder="请输入设备序列号，如 N74C1120 或 SJ-2304M01013"
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

                {/* 项目地点 - 简化为直接输入 */}
            <div className="space-y-2">
                  <Label htmlFor="projectLocation" className="text-sm text-muted-foreground">
                    项目地点 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="projectLocation"
                  value={projectLocation}
                  onChange={(e) => setProjectLocation(e.target.value)}
                  placeholder="请输入项目地点"
                  className={cn(
                    "pl-10 bg-muted/50 border-border",
                    formErrors.projectLocation && "border-destructive"
                  )}
                />
              </div>
              
              {/* 预设项目地点选项 */}
              <div className="flex flex-wrap gap-2 mt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setProjectLocation("深圳总部-1F大门")}
                >
                  深圳总部
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setProjectLocation("广州分公司-前台")}
                >
                  广州分公司
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setProjectLocation("上海办事处")}
                >
                  上海办事处
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setProjectLocation("北京研发中心")}
                >
                  北京研发中心
                </Button>
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

            {/* 故障信息 */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-medium">故障信息</CardTitle>
          </CardHeader>
              <CardContent className="space-y-4">
                {/* 维修原因 - 多行文本框 */}
                <div className="space-y-2">
                  <Label htmlFor="faultDescription" className="text-sm text-muted-foreground">
                    故障描述 <span className="text-destructive">*</span>
                  </Label>
            <Textarea
                    id="faultDescription"
                    value={faultDescription}
                    onChange={(e) => setFaultDescription(e.target.value)}
                    placeholder="请详细描述故障原因，包括症状、发生频率和相关观察..."
                    className={cn(
                      "min-h-[120px] bg-muted/50 border-border resize-none",
                      formErrors.faultDescription && "border-destructive"
                    )}
                  />
                  {formErrors.faultDescription && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.faultDescription}
                    </p>
                  )}
                </div>

                {/* 时间管理 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 报修时间 - 只读 */}
                  <div className="space-y-2">
                    <Label htmlFor="reportDate" className="text-sm text-muted-foreground">
                      报修时间
                    </Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reportDate"
                        value={format(reportDate, "yyyy-MM-dd HH:mm", { locale: zhCN })}
                        readOnly
                        className="pl-10 bg-muted/50 border-border text-muted-foreground"
                      />
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-5 md:space-y-6">
            {/* 快递物流信息 */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-medium">快递物流信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 快递公司 - 手动输入 */}
                <div className="space-y-2">
                  <Label htmlFor="expressCompany" className="text-sm text-muted-foreground">
                    物流名称 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="expressCompany"
                    value={expressCompany}
                    onChange={(e) => setExpressCompany(e.target.value)}
                    placeholder="请输入快递公司名称"
                    className="bg-muted/50 border-border"
                  />
                  
                  {/* 快递公司快速选择 */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setExpressCompany("顺丰速运")}
                    >
                      顺丰速运
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setExpressCompany("京东物流")}
                    >
                      京东物流
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setExpressCompany("德邦快递")}
                    >
                      德邦快递
                    </Button>
                  </div>
                  
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
                    发出快递单号 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="trackingNumber"
                    value={trackingNumber}
                    onChange={(e) => {
                      setTrackingNumber(e.target.value)
                      validateTrackingNumber(e.target.value)
                    }}
                    placeholder="请输入发出快递单号（字母和数字组合，至少8位）"
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
                    寄件人详细地址 <span className="text-destructive">*</span>
                  </Label>
                  
                  {/* 省市区三级联动 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 省份选择 */}
                    <Select
                      value={senderProvince}
                      onValueChange={(value) => {
                        setSenderProvince(value)
                        setSenderCity("") // 清空城市
                        setSenderDistrict("") // 清空区县
                      }}
                    >
                      <SelectTrigger className="bg-muted/50 border-border">
                        <SelectValue placeholder="请选择省份" />
                      </SelectTrigger>
                      <SelectContent>
                        {provinceOptions.map((province) => (
                          <SelectItem key={province.code} value={province.code}>
                            {province.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* 城市选择 */}
                    <Select
                      value={senderCity}
                      onValueChange={(value) => {
                        setSenderCity(value)
                        setSenderDistrict("") // 清空区县
                      }}
                      disabled={!senderProvince}
                    >
                      <SelectTrigger className="bg-muted/50 border-border">
                        <SelectValue placeholder={senderProvince ? "请选择城市" : "请先选择省份"} />
                      </SelectTrigger>
                      <SelectContent>
                        {cityOptions.map((city) => (
                          <SelectItem key={city.code} value={city.code}>
                            {city.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* 区县选择 */}
                    <Select
                      value={senderDistrict}
                      onValueChange={setSenderDistrict}
                      disabled={!senderProvince || !senderCity}
                    >
                      <SelectTrigger className="bg-muted/50 border-border">
                        <SelectValue placeholder={senderCity ? "请选择区县" : "请先选择城市"} />
                      </SelectTrigger>
                      <SelectContent>
                        {districtOptions.map((district) => (
                          <SelectItem key={district.code} value={district.code}>
                            {district.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 详细地址输入框 */}
                  <Input
                    placeholder="请输入详细地址（街道、门牌号、小区名称等）"
                    value={senderDetailAddress}
                    onChange={(e) => setSenderDetailAddress(e.target.value)}
                    className="bg-muted/50 border-border"
                  />
                  
                  {formErrors.senderAddress && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.senderAddress}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 照片凭证 - 放在快递信息下方，与故障信息等高 */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-medium">照片凭证</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 设备铭牌照片 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex justify-between">
                    <span>设备铭牌照片 <span className="text-destructive">*</span></span>
                    <span className="text-xs">{devicePhotos.length}/1</span>
                  </Label>
                  <input
                    type="file"
                    ref={devicePhotoInputRef}
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleDevicePhotoChange}
                    className="hidden"
                  />
                  <div className="grid grid-cols-1 gap-3">
                    {devicePhotos.map((photo, index) => (
                      <div
                        key={`device-photo-${index}-${photo.substring(0, 20)}`}
                        className="relative aspect-video rounded-lg overflow-hidden bg-muted border border-border group"
                      >
                        <img
                          src={photo}
                          alt="设备铭牌照片"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveDevicePhoto(index)}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors z-10"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <div
                          onClick={handleAddDevicePhoto}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <span className="text-white text-sm font-medium">点击更换图片</span>
                        </div>
                      </div>
                    ))}
                    {devicePhotos.length < 1 && (
                      <div
                        onClick={handleAddDevicePhoto}
                        onDrop={handleDevicePhotoDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.add('border-primary', 'bg-primary/5')
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.remove('border-primary', 'bg-primary/5')
                        }}
                        className="aspect-video rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Upload className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium">点击或拖拽上传图片</p>
                          <p className="text-xs text-muted-foreground">必须清晰显示设备编号（JPG/PNG/WEBP，最大5MB）</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {formErrors.devicePhotos && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {formErrors.devicePhotos}
                    </p>
                  )}
            </div>

                {/* 损坏细节照片 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex justify-between">
                    <span>硬件损坏细节照片（选填）</span>
                    <span className="text-xs">{damagePhotos.length}/3</span>
                  </Label>
                  <input
                    type="file"
                    ref={damagePhotoInputRef}
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleDamagePhotoChange}
                    className="hidden"
                  />
            <div className="grid grid-cols-3 gap-3">
                    {damagePhotos.map((photo, index) => (
                <div
                  key={`damage-photo-${index}-${photo.substring(0, 20)}`}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border"
                >
                  <img
                          src={photo}
                          alt={`损坏细节照片 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                          type="button"
                          onClick={() => handleRemoveDamagePhoto(index)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
                    {damagePhotos.length < 3 && (
                      <div
                        onClick={handleAddDamagePhoto}
                        onDrop={handleDamagePhotoDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.add('border-primary', 'bg-primary/5')
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.remove('border-primary', 'bg-primary/5')
                        }}
                        className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-primary" />
                  </div>
                        <span className="text-xs text-muted-foreground">点击或拖拽上传图片</span>
                      </div>
                    )}
                  </div>
                </div>
          </CardContent>
        </Card>
          </div>
        </div>

        {/* Submit Button */}
        <div className="md:flex md:justify-end">
          <div className="fixed md:static bottom-20 md:bottom-auto left-0 md:left-auto right-0 md:right-auto p-4 md:p-0 bg-gradient-to-t from-background via-background to-transparent md:bg-none md:w-auto w-full md:max-w-none max-w-md mx-auto">
            <Button 
              className="w-full md:w-auto h-12 md:h-10 text-base font-medium px-8" 
              onClick={handleSubmit} 
              disabled={isSubmitting || isSubmitted || (quantity === 1 ? deviceValid === false : batchSerialNumbers.length !== quantity)}
            >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {quantity === 1 ? "提交中..." : `提交中... (${batchSerialNumbers.length}/${quantity})`}
            </span>
          ) : (
                quantity === 1 ? "提交故障报告" : `提交 ${quantity} 个故障报告`
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>批量输入序列号 ({quantity} 个)</DialogTitle>
            <DialogDescription>
              请依次输入 {quantity} 个设备的序列号，型号等信息将自动应用到所有工单
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-3 max-h-[50vh] overflow-y-auto">
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

          <DialogFooter>
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