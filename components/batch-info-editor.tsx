"use client"

import { useState } from "react"
import { Edit, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface BatchInfo {
  batchId: string
  projectName: string
  contactInfo: string
  projectLocation: string
  senderAddress?: string
}

interface BatchInfoEditorProps {
  batchInfo: BatchInfo
  onUpdated: () => void
  allowEdit?: boolean
}

export default function BatchInfoEditor({ 
  batchInfo, 
  onUpdated,
  allowEdit = true 
}: BatchInfoEditorProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    projectName: batchInfo.projectName || "",
    contactInfo: batchInfo.contactInfo || "",
    projectLocation: batchInfo.projectLocation || "",
    senderAddress: batchInfo.senderAddress || ""
  })

  const handleOpenEdit = () => {
    setFormData({
      projectName: batchInfo.projectName || "",
      contactInfo: batchInfo.contactInfo || "",
      projectLocation: batchInfo.projectLocation || "",
      senderAddress: batchInfo.senderAddress || ""
    })
    setIsEditDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.projectName || !formData.contactInfo) {
      toast.error("项目名称和联系信息为必填项")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tickets/batch-info/${batchInfo.batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: formData.projectName,
          contactInfo: formData.contactInfo,
          projectLocation: formData.projectLocation,
          senderAddress: formData.senderAddress
        })
      })

      const result = await response.json()
      if (result.success) {
        toast.success("批次信息已更新")
        setIsEditDialogOpen(false)
        onUpdated()
      } else {
        toast.error(result.message || "更新失败")
      }
    } catch (error) {
      console.error("更新批次信息失败:", error)
      toast.error("更新失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {allowEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenEdit}
        >
          <Edit className="w-4 h-4 mr-2" />
          编辑批次信息
        </Button>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>编辑批次信息</DialogTitle>
            <DialogDescription>
              修改批次的基本信息（批次号：{batchInfo.batchId}）
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-projectName">项目名称 *</Label>
                <Input
                  id="edit-projectName"
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  placeholder="请输入项目名称"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-contactInfo">联系信息 *</Label>
                <Input
                  id="edit-contactInfo"
                  value={formData.contactInfo}
                  onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                  placeholder="如：张三 138xxxx1234"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-projectLocation">项目位置</Label>
                <Input
                  id="edit-projectLocation"
                  value={formData.projectLocation}
                  onChange={(e) => setFormData({ ...formData, projectLocation: e.target.value })}
                  placeholder="请输入项目位置"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-senderAddress">寄件地址</Label>
                <Input
                  id="edit-senderAddress"
                  value={formData.senderAddress}
                  onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value })}
                  placeholder="请输入寄件地址"
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
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
