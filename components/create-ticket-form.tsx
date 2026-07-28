"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useDeviceModels } from "@/hooks/use-device-models"
import { useDeviceCheck } from "@/hooks/use-device-check"
import { useAuth } from "@/context/auth-context"
import { useRepairContext } from "@/context/RepairContext"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface CreateTicketFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  initialData?: {
    senderAddress?: string
    contactName?: string
    contactPhone?: string
    projectName?: string
    category?: string
    subCategory?: string
    devices?: Array<{
      serialNumber: string
      faultDescription: string
    }>
  }
}

export default function CreateTicketForm({ onSuccess, onCancel, initialData }: CreateTicketFormProps) {
  const { user } = useAuth()
  const { addRepair } = useRepairContext()
  const router = useRouter()

  // 客户信息（使用初始数据预填充）
  const [senderAddress, setSenderAddress] = useState(initialData?.senderAddress || "")
  const [contactName, setContactName] = useState(initialData?.contactName || "")
  const [contactPhone, setContactPhone] = useState(initialData?.contactPhone || "")
  const [projectName, setProjectName] = useState(initialData?.projectName || "")
  const [trackingNumberIn, setTrackingNumberIn] = useState("")

  // 产品信息
  const { models: catalogModels, loading: modelsLoading, error: modelsError } = useDeviceModels()
  // 设备信息（使用初始数据预填充类别，但设备列表留空）
  const [category, setCategory] = useState<string>(initialData?.category || "")
  const [subCategory, setSubCategory] = useState<string>(initialData?.subCategory || "")
  const [modelName, setModelName] = useState<string>("")
  const [productSn, setProductSn] = useState<string>("")
  const [fullSpec, setFullSpec] = useState<string>("")
  const [isSnPendingVerify, setIsSnPendingVerify] = useState(false)

  // 故障/费用信息
  const [faultDescription, setFaultDescription] = useState("")
  const [faultPoint, setFaultPoint] = useState("")
  const [isChargeable, setIsChargeable] = useState<"yes" | "no">("no")
  const [repairCost, setRepairCost] = useState<string>("")

  // 设备校验（根据序列号查询库存，自动填充物料代码等）
  const {
    exists: deviceExists,
    data: checkedDevice,
    loading: checkingDevice,
    error: deviceError,
  } = useDeviceCheck(productSn, 500)

  // 表单状态
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 由产品目录构建三级联动选项
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    catalogModels.forEach((m) => {
      const c = (m.category || "").trim()
      if (c) set.add(c)
    })
    return Array.from(set)
  }, [catalogModels])

  const subCategoryOptions = useMemo(() => {
    if (!category) return []
    const set = new Set<string>()
    catalogModels
      .filter((m) => (m.category || "").trim() === category)
      .forEach((m) => {
        const s = (m.subCategory || "").trim()
        if (s) set.add(s)
      })
    return Array.from(set)
  }, [catalogModels, category])

  const modelOptions = useMemo(() => {
    if (!category || !subCategory) return []
    return catalogModels.filter(
      (m) =>
        (m.category || "").trim() === category &&
        (m.subCategory || "").trim() === subCategory
    )
  }, [catalogModels, category, subCategory])

  // 当型号变化时，自动填充详细规格（如果 Product_Catalog 提供）
  const selectedModel = useMemo(
    () => modelOptions.find((m) => m.name === modelName || m.code === modelName),
    [modelOptions, modelName]
  )

  // 基本校验
  const validate = () => {
    const next: Record<string, string> = {}

    if (!senderAddress.trim()) next.senderAddress = "请输入寄件地址"
    if (!contactName.trim()) next.contactName = "请输入联系人姓名"
    if (!contactPhone.trim()) next.contactPhone = "请输入联系人电话"
    if (!projectName.trim()) next.projectName = "请输入项目名称"
    if (!trackingNumberIn.trim()) next.trackingNumberIn = "请输入发出快递单号"

    if (!category) next.category = "请选择产品一级分类"
    if (!subCategory) next.subCategory = "请选择二级分类"
    if (!modelName) next.modelName = "请选择具体型号"

    if (!isSnPendingVerify) {
      if (!productSn.trim()) next.productSn = "请输入产品序列号"
      if (productSn && deviceExists === false) {
        next.productSn = deviceError || "设备序列号不存在于设备档案中"
      }
    }

    if (!faultDescription.trim()) next.faultDescription = "请填写故障描述"

    if (isChargeable === "yes" && (!repairCost || Number.isNaN(Number(repairCost)))) {
      next.repairCost = "请输入有效的收费金额"
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!validate()) return

    try {
      setSubmitting(true)

      const formData = new FormData()

      // 与后端现有字段对齐：支持"标签磨损/无法辨识"模式
      const snForSubmit = isSnPendingVerify ? "待验证" : productSn.trim()
      formData.append("deviceSn", snForSubmit)
      formData.append("faultDesc", faultDescription.trim())
      formData.append("projectLocation", projectName.trim())

      // 客户信息类
      formData.append("senderAddress", senderAddress.trim())
      formData.append("contactName", contactName.trim())
      formData.append("contactPhone", contactPhone.trim())
      formData.append("projectName", projectName.trim())
      formData.append("trackingNumberIn", trackingNumberIn.trim())

      // 产品信息类
      formData.append("category", category)
      formData.append("subCategory", subCategory)
      formData.append("modelName", modelName)
      formData.append("productSn", isSnPendingVerify ? "待验证" : productSn.trim())
      if (fullSpec.trim()) {
        formData.append("fullSpec", fullSpec.trim())
      }

      // 维修信息类
      if (faultPoint.trim()) {
        formData.append("faultPoint", faultPoint.trim())
      }
      formData.append("isChargeable", isChargeable === "yes" ? "true" : "false")
      if (repairCost && !Number.isNaN(Number(repairCost))) {
        formData.append("repairCost", repairCost)
      }

      // 报告人（与现场报修保持一致）
      const userId = user?.id ? String(user.id) : ""
      formData.append("userId", userId)

      // 由后端/库存自动推导 MaterialCode，这里不再手工传入

      const resp = await fetch("/api/tickets/create", {
        method: "POST",
        body: formData,
      })

      const text = await resp.text()
      interface ApiResponse {
        success: boolean
        message?: string
        error?: string
        data?: {
          batchId: string
        }
      }
      let json: ApiResponse = { success: false }
      try {
        json = text ? JSON.parse(text) : { success: false }
      } catch {
        throw new Error(text || "服务器返回了无效响应")
      }

      if (!resp.ok || !json.success) {
        throw new Error(json.message || json.error || `创建工单失败 (HTTP ${resp.status})`)
      }

      // 前端同步新增一条记录，方便立刻在列表中看到
      const now = new Date()
      const reportedAt = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(
        now.getHours()
      ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

      addRepair({
        deviceId: 0,
        deviceName: selectedModel?.name || modelName,
        deviceModel: selectedModel?.fullSpec || selectedModel?.name || modelName,
        problem: faultDescription,
        status: "pending",
        priority: "medium",
        location: projectName,
        reportedBy: user?.realName || user?.username || "系统用户",
        deviceSerialNumber: productSn.trim(),
        reportedAt,
        expressCompany: "",
        trackingNumber: trackingNumberIn.trim(),
      } as any)

      if (onSuccess) onSuccess()
      // 管理端通常停留当前列表，这里不强制跳转；如需跳转可以在外部处理
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "创建工单失败，请稍后重试"
      console.error("创建工单失败:", err)
      alert(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* 客户信息 */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">客户信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                寄件地址 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={senderAddress}
                onChange={(e) => setSenderAddress(e.target.value)}
                placeholder="请输入寄件地址"
                className={cn(errors.senderAddress && "border-destructive")}
              />
              {errors.senderAddress && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.senderAddress}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  联系人 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="请输入联系人姓名"
                  className={cn(errors.contactName && "border-destructive")}
                />
                {errors.contactName && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.contactName}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  联系电话 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="请输入联系电话"
                  className={cn(errors.contactPhone && "border-destructive")}
                />
                {errors.contactPhone && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.contactPhone}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                项目名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="如：XX地铁站A口闸机"
                className={cn(errors.projectName && "border-destructive")}
              />
              {errors.projectName && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.projectName}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                发出快递单号 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={trackingNumberIn}
                onChange={(e) => setTrackingNumberIn(e.target.value)}
                placeholder="请输入寄往爱克信的快递单号"
                className={cn(errors.trackingNumberIn && "border-destructive")}
              />
              {errors.trackingNumberIn && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.trackingNumberIn}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 产品信息 */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">产品信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>
                  一级分类 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={category}
                  onValueChange={(value) => {
                    setCategory(value)
                    setSubCategory("")
                    setModelName("")
                  }}
                >
                  <SelectTrigger
                    className={cn("bg-muted/40", errors.category && "border-destructive")}
                  >
                    <SelectValue placeholder={modelsLoading ? "加载中..." : "选择分类"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.length === 0 && !modelsLoading && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        产品目录中暂未维护分类
                      </div>
                    )}
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.category}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  二级分类 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={subCategory}
                  onValueChange={(value) => {
                    setSubCategory(value)
                    setModelName("")
                  }}
                  disabled={!category}
                >
                  <SelectTrigger
                    className={cn("bg-muted/40", errors.subCategory && "border-destructive")}
                  >
                    <SelectValue placeholder={category ? "选择子类" : "请先选择一级分类"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subCategoryOptions.length === 0 && category && !modelsLoading && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        当前分类下暂无子类，请在产品目录中维护
                      </div>
                    )}
                    {subCategoryOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.subCategory && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.subCategory}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  型号 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={modelName}
                  onValueChange={(value) => {
                    setModelName(value)
                    if (selectedModel?.fullSpec) {
                      setFullSpec(selectedModel.fullSpec)
                    }
                  }}
                  disabled={!category || !subCategory}
                >
                  <SelectTrigger
                    className={cn("bg-muted/40", errors.modelName && "border-destructive")}
                  >
                    <SelectValue placeholder={!subCategory ? "请先选择二级分类" : "选择型号"} />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.length === 0 && subCategory && !modelsLoading && (
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
                {errors.modelName && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.modelName}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  产品序列号 ProductSN <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pending-sn"
                    checked={isSnPendingVerify}
                    onCheckedChange={(checked) => {
                      const value = Boolean(checked)
                      setIsSnPendingVerify(value)
                      if (value) {
                        // 清空 SN，避免误用旧值
                        setProductSn("")
                      }
                    }}
                  />
                  <Label
                    htmlFor="pending-sn"
                    className="text-xs text-muted-foreground cursor-pointer select-none"
                  >
                    标签磨损/无法辨识
                  </Label>
                </div>
              </div>
              <Input
                value={productSn}
                onChange={(e) => setProductSn(e.target.value.trim().toUpperCase())}
                placeholder="请输入设备序列号，例如 N74C1120"
                className={cn(errors.productSn && "border-destructive")}
                disabled={isSnPendingVerify}
              />
              {isSnPendingVerify ? (
                <p className="text-xs text-amber-600">
                  请在寄件包裹中注明本工单号，工程师收货后将核实并补录设备序列号。
                </p>
              ) : (
                <>
                  {checkingDevice && (
                    <p className="text-xs text-muted-foreground">正在校验设备库存...</p>
                  )}
                  {deviceError && deviceExists === null && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {deviceError}
                    </p>
                  )}
                  {deviceExists === false && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.productSn || "未在设备库存中找到该序列号"}
                    </p>
                  )}
                  {checkedDevice && deviceExists && (
                    <p className="text-xs text-muted-foreground">
                      库存设备：{checkedDevice.deviceName} / {checkedDevice.modelName}；物料代码：
                      {checkedDevice.materialCode || "待补充"}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>详细规格 FullSpec（可选）</Label>
              <Input
                value={fullSpec}
                onChange={(e) => setFullSpec(e.target.value)}
                placeholder="如需要，可填写更详细的规格型号"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 故障与费用信息 */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base md:text-lg">故障与费用信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              故障描述 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={faultDescription}
              onChange={(e) => setFaultDescription(e.target.value)}
              placeholder="请描述故障现象、报错提示、发生场景等信息"
              className={cn(
                "min-h-[100px]",
                errors.faultDescription && "border-destructive"
              )}
            />
            {errors.faultDescription && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.faultDescription}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>故障点（可选）</Label>
              <Input
                value={faultPoint}
                onChange={(e) => setFaultPoint(e.target.value)}
                placeholder="如已确认，可填写具体故障点"
              />
            </div>
            <div className="space-y-1.5">
              <Label>是否收费</Label>
              <Select
                value={isChargeable}
                onValueChange={(v: "yes" | "no") => setIsChargeable(v)}
              >
                <SelectTrigger className="bg-muted/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">不收费</SelectItem>
                  <SelectItem value="yes">收费</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>收费金额（元）</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={repairCost}
                onChange={(e) => setRepairCost(e.target.value)}
                placeholder="仅在收费时填写"
                className={cn(errors.repairCost && "border-destructive")}
              />
              {errors.repairCost && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.repairCost}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel} disabled={submitting}>
                取消
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "提交中..." : "新建工单"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

