"use client"

import { useState, useEffect } from "react"
import RepairDetail from "@/components/repair-detail"
import BatchWorkOrderDetail from "@/components/batch-work-order-detail"
import { isSequentialBatchId } from "@/lib/batch-number-format"

interface RepairDetailWrapperProps {
  taskId: string
  onBack: () => void | Promise<void>
}

/**
 * 智能包装组件：根据 taskId 类型自动选择渲染模式
 * - 如果 taskId 是批次ID（如 WO260204XXXX），渲染工单总览模式
 * - 如果 taskId 是数字ID或设备序列号，渲染单设备详情模式
 */
export default function RepairDetailWrapper({ taskId, onBack }: RepairDetailWrapperProps) {
  const [isBatchId, setIsBatchId] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const detectIdType = async () => {
      try {
        setLoading(true)
        
        // 同时兼容当前 YYYYMMDDxxx 格式和历史 WO 开头的批次号。
        if (isSequentialBatchId(taskId)) {
          // 是批次ID格式，先验证该批次是否存在
          const response = await fetch(`/api/tickets/batch-devices/${taskId}`)
          const result = await response.json()
          
          if (response.ok && result.success) {
            setIsBatchId(true)
          } else {
            // 批次不存在，可能是设备ID，按单设备模式处理
            setIsBatchId(false)
          }
        } else {
          // 纯数字或其他格式，按单设备模式处理
          setIsBatchId(false)
        }
      } catch (error) {
        console.error("检测ID类型失败:", error)
        // 出错时默认按单设备模式处理
        setIsBatchId(false)
      } finally {
        setLoading(false)
      }
    }

    detectIdType()
  }, [taskId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  // 根据ID类型渲染对应的组件
  return isBatchId ? (
    <BatchWorkOrderDetail batchId={taskId} onBack={onBack} />
  ) : (
    <RepairDetail taskId={taskId} onBack={onBack} />
  )
}
