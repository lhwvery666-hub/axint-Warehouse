"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, Trash2, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

interface Device {
  id: string
  deviceSerialNumber: string
  modelName: string
  deviceName: string
  category: string
  subCategory: string
  faultDescription: string
  materialCode?: string
  quantity?: number
}

interface BatchDeviceManagerProps {
  batchId: string
  devices: Device[]
  onDevicesChanged: () => void
  allowEdit?: boolean
  buttonOnly?: boolean  // 只显示按钮，不显示表格
}

export default function BatchDeviceManager({ 
  batchId, 
  devices, 
  onDevicesChanged,
  allowEdit = true,
  buttonOnly = false
}: BatchDeviceManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 表单字段
  const [formData, setFormData] = useState({
    deviceSn: "",
    modelName: "",
    deviceName: "",
    category: "",
    subCategory: "",
    faultDescription: "",
    materialCode: "",
    quantity: 1
  })

  const resetForm = () => {
    setFormData({
      deviceSn: "",
      modelName: "",
      deviceName: "",
      category: "",
      subCategory: "",
      faultDescription: "",
      materialCode: "",
      quantity: 1
    })
  }

  const handleOpenAdd = () => {
    resetForm()
    setIsAddDialogOpen(true)
  }

  const handleOpenEdit = (device: Device) => {
    setSelectedDevice(device)
    setFormData({
      deviceSn: device.deviceSerialNumber,
      modelName: device.modelName,
      deviceName: device.deviceName,
      category: device.category || "",
      subCategory: device.subCategory || "",
      faultDescription: device.faultDescription || "",
      materialCode: device.materialCode || "",
      quantity: device.quantity || 1
    })
    setIsEditDialogOpen(true)
  }

  const handleAddDevice = async () => {
    if (!formData.deviceSn || !formData.modelName) {
      toast.error("设备序列号和型号为必填项")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tickets/batch-devices/${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          devices: [{
            deviceSn: formData.deviceSn,
            modelName: formData.modelName,
            deviceName: formData.deviceName,
            category: formData.category,
            subCategory: formData.subCategory,
            faultDescription: formData.faultDescription,
            materialCode: formData.materialCode,
            quantity: formData.quantity
          }]
        })
      })

      const result = await response.json()
      if (result.success) {
        toast.success("设备已添加")
        setIsAddDialogOpen(false)
        resetForm()
        onDevicesChanged()
      } else {
        toast.error(result.message || "添加失败")
      }
    } catch (error) {
      console.error("添加设备失败:", error)
      toast.error("添加失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditDevice = async () => {
    if (!selectedDevice || !formData.deviceSn || !formData.modelName) {
      toast.error("设备序列号和型号为必填项")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tickets/batch-devices/${batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          updates: {
            deviceSn: formData.deviceSn,
            modelName: formData.modelName,
            deviceName: formData.deviceName,
            category: formData.category,
            subCategory: formData.subCategory,
            faultDescription: formData.faultDescription,
            materialCode: formData.materialCode,
            quantity: formData.quantity
          }
        })
      })

      const result = await response.json()
      if (result.success) {
        toast.success("设备信息已更新")
        setIsEditDialogOpen(false)
        setSelectedDevice(null)
        resetForm()
        onDevicesChanged()
      } else {
        toast.error(result.message || "更新失败")
      }
    } catch (error) {
      console.error("更新设备失败:", error)
      toast.error("更新失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteDevice = async (device: Device) => {
    if (!confirm(`确定要删除设备 ${device.deviceSerialNumber} 吗？`)) {
      return
    }

    try {
      const response = await fetch(`/api/tickets/batch-devices/${batchId}?deviceId=${device.id}`, {
        method: 'DELETE'
      })

      const result = await response.json()
      if (result.success) {
        toast.success("设备已删除")
        onDevicesChanged()
      } else {
        toast.error(result.message || "删除失败")
      }
    } catch (error) {
      console.error("删除设备失败:", error)
      toast.error("删除失败，请重试")
    }
  }

  return (
    <div className="space-y-4">
      {buttonOnly ? (
        // 只显示按钮模式
        allowEdit && (
          <Button onClick={handleOpenAdd} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            添加设备
          </Button>
        )
      ) : (
        // 完整模式：显示标题、按钮和表格
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">设备列表 ({devices.length}台)</h3>
            {allowEdit && (
              <Button onClick={handleOpenAdd} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                添加设备
              </Button>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>序号</TableHead>
                  <TableHead>设备序列号</TableHead>
                  <TableHead>产品型号</TableHead>
                  <TableHead>物料名称</TableHead>
                  <TableHead>故障描述</TableHead>
                  {allowEdit && <TableHead className="text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device, index) => (
                  <TableRow key={device.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-mono">{device.deviceSerialNumber}</TableCell>
                    <TableCell>{device.modelName}</TableCell>
                    <TableCell>{device.deviceName || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">{device.faultDescription || "-"}</TableCell>
                    {allowEdit && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(device)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDevice(device)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* 添加设备对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>添加设备</DialogTitle>
            <DialogDescription>向批次中添加新设备</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-2">
            <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-deviceSn">设备序列号 *</Label>
                <Input
                  id="add-deviceSn"
                  value={formData.deviceSn}
                  onChange={(e) => setFormData({ ...formData, deviceSn: e.target.value })}
                  placeholder="请输入设备序列号"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-modelName">产品型号 *</Label>
                <Input
                  id="add-modelName"
                  value={formData.modelName}
                  onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                  placeholder="请输入产品型号"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-deviceName">物料名称</Label>
                <Input
                  id="add-deviceName"
                  value={formData.deviceName}
                  onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })}
                  placeholder="请输入物料名称"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-materialCode">物料代码</Label>
                <Input
                  id="add-materialCode"
                  value={formData.materialCode}
                  onChange={(e) => setFormData({ ...formData, materialCode: e.target.value })}
                  placeholder="请输入物料代码"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-category">产品类别</Label>
                <Input
                  id="add-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="如：激光器"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-subCategory">子类别</Label>
                <Input
                  id="add-subCategory"
                  value={formData.subCategory}
                  onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                  placeholder="如：光纤激光器"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-quantity">数量</Label>
                <Input
                  id="add-quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-faultDescription">故障描述</Label>
              <Textarea
                id="add-faultDescription"
                value={formData.faultDescription}
                onChange={(e) => setFormData({ ...formData, faultDescription: e.target.value })}
                placeholder="请描述设备的故障情况"
                rows={3}
              />
            </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleAddDevice} disabled={isSubmitting}>
              {isSubmitting ? "添加中..." : "添加设备"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑设备对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>编辑设备信息</DialogTitle>
            <DialogDescription>修改设备的基本信息</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-2">
            <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-deviceSn">设备序列号 *</Label>
                <Input
                  id="edit-deviceSn"
                  value={formData.deviceSn}
                  onChange={(e) => setFormData({ ...formData, deviceSn: e.target.value })}
                  placeholder="请输入设备序列号"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-modelName">产品型号 *</Label>
                <Input
                  id="edit-modelName"
                  value={formData.modelName}
                  onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                  placeholder="请输入产品型号"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-deviceName">物料名称</Label>
                <Input
                  id="edit-deviceName"
                  value={formData.deviceName}
                  onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })}
                  placeholder="请输入物料名称"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-materialCode">物料代码</Label>
                <Input
                  id="edit-materialCode"
                  value={formData.materialCode}
                  onChange={(e) => setFormData({ ...formData, materialCode: e.target.value })}
                  placeholder="请输入物料代码"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-category">产品类别</Label>
                <Input
                  id="edit-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="如：激光器"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-subCategory">子类别</Label>
                <Input
                  id="edit-subCategory"
                  value={formData.subCategory}
                  onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                  placeholder="如：光纤激光器"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-quantity">数量</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-faultDescription">故障描述</Label>
              <Textarea
                id="edit-faultDescription"
                value={formData.faultDescription}
                onChange={(e) => setFormData({ ...formData, faultDescription: e.target.value })}
                placeholder="请描述设备的故障情况"
                rows={3}
              />
            </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleEditDevice} disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
