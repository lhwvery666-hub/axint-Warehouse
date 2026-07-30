/**
 * 工单动作操作栏组件
 * 根据当前工单状态和用户角色，智能显示唯一正确的操作按钮
 * 实现前置条件检查（卡点逻辑）
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, Upload, Loader2 } from "lucide-react";
import { RepairAction, TicketStatus, UserRole, TICKET_STATUS_LABELS, normalizeTicketStatus } from "@/lib/enums";
import {
  getAvailableActions,
  TicketAction,
  TICKET_ACTION_LABELS,
} from "@/lib/ticket-workflow-actions";
import { cn } from "@/lib/utils";
import { sumDeviceQuantity } from "@/lib/device-quantity";

// ==================== 类型定义 ====================

/**
 * 工单数据接口（简化版，只包含操作栏需要的字段）
 */
export interface TicketData {
  id: string;
  batchId?: string;
  status: TicketStatus;
  // 用于验证的字段
  faultPoint?: string | null;
  repairCost?: number | null;
  repairAction?: string | null;
  supplierName?: string | null;
  factoryTrackingNum?: string | null;
  signedReportPhoto?: string | null; // 签字凭证照片路径
  // 批次相关
  devices?: Array<{
    id: string;
    quantity?: number | null;
    shippingDate?: string | null; // 出库日期
  }>;
}

/**
 * 当前用户接口
 */
export interface CurrentUser {
  id: string;
  name?: string;
  role: UserRole;
}

/**
 * 前置条件验证结果
 */
interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * 组件属性
 */
export interface TicketActionBarProps {
  ticket: TicketData;
  currentUser: CurrentUser;
  onActionSuccess?: () => void; // 操作成功后的回调（用于刷新数据）
  excludedActions?: readonly TicketAction[];
  className?: string;
}

// ==================== 前置条件验证函数 ====================

/**
 * 验证所有设备是否都有出库日期（针对批次工单）
 */
function validateAllDevicesHaveShippingDate(ticket: TicketData): ValidationResult {
  if (!ticket.batchId || !ticket.devices || ticket.devices.length === 0) {
    // 单个工单，不需要验证批次设备
    return { valid: true };
  }

  const devicesWithoutDate = ticket.devices.filter(
    (device) => !device.shippingDate || device.shippingDate.trim() === ""
  );

  if (devicesWithoutDate.length > 0) {
    return {
      valid: false,
      message: `请先录入所有设备的出库日期（还有 ${sumDeviceQuantity(devicesWithoutDate)} 台设备未录入）`,
    };
  }

  return { valid: true };
}

/**
 * 验证维修报告是否填写完整
 */
function validateRepairReportComplete(ticket: TicketData): ValidationResult {
  const missingFields: string[] = [];

  if (!ticket.faultPoint || ticket.faultPoint.trim() === "") {
    missingFields.push("故障原因");
  }

  if (ticket.repairCost === null || ticket.repairCost === undefined) {
    missingFields.push("维修费用");
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `请先完善维修报告：缺少 ${missingFields.join("、")}`,
    };
  }

  return { valid: true };
}

function validateFactoryRepairDetails(ticket: TicketData): ValidationResult {
  const missingFields: string[] = [];
  if (ticket.repairAction !== RepairAction.RMA) missingFields.push("维修动作选择返厂维修");
  if (!ticket.supplierName?.trim()) missingFields.push("供应商名称");
  if (!ticket.factoryTrackingNum?.trim()) missingFields.push("返厂快递单号");

  return missingFields.length === 0
    ? { valid: true }
    : { valid: false, message: `请先保存：${missingFields.join("、")}` };
}

/**
 * 根据验证键执行对应的验证逻辑
 */
function runValidation(
  validationKey: string,
  ticket: TicketData
): ValidationResult {
  switch (validationKey) {
    case "all_devices_have_shipping_date":
      return validateAllDevicesHaveShippingDate(ticket);
    case "repair_report_complete":
      return validateRepairReportComplete(ticket);
    case "factory_repair_details_complete":
      return validateFactoryRepairDetails(ticket);
    default:
      console.warn(`[TicketActionBar] 未知的验证键: ${validationKey}`);
      return { valid: true };
  }
}

// ==================== 主组件 ====================

export default function TicketActionBar({
  ticket,
  currentUser,
  onActionSuccess,
  excludedActions = [],
  className,
}: TicketActionBarProps) {
  // ==================== 状态管理 ====================
  
  const [executingAction, setExecutingAction] = useState<TicketAction | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ==================== 核心逻辑：获取当前可执行的动作 ====================

  const availableTransitions = getAvailableActions(ticket.status, currentUser.role)
    .filter((transition) => !excludedActions.includes(transition.action));

  // 如果没有可执行的动作，不显示任何操作栏
  if (availableTransitions.length === 0) {
    return null;
  }

  // ==================== 动作执行处理 ====================

  /**
   * 执行工作流动作
   */
  const handleExecuteAction = async (action: TicketAction) => {
    setValidationError(null);

    // 特殊处理：上传签字凭证需要弹出文件上传对话框
    if (action === TicketAction.UPLOAD_SIGNATURE) {
      setShowUploadDialog(true);
      return;
    }

    // 其他动作直接调用 API
    await executeAction(action);
  };

  /**
   * 调用 Server Action API
   */
  const executeAction = async (action: TicketAction) => {
    setExecutingAction(action);

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/workflow-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          currentStatus: ticket.status,
          userRole: currentUser.role,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setValidationError(result.message || "操作失败");
        return;
      }

      // 操作成功，触发回调
      if (onActionSuccess) {
        onActionSuccess();
      }
    } catch (error: unknown) {
      console.error("[TicketActionBar] 执行动作失败:", error);
      setValidationError(error instanceof Error ? error.message : "网络错误，请稍后重试");
    } finally {
      setExecutingAction(null);
    }
  };

  /**
   * 处理文件上传（签字凭证）
   */
  const handleFileUpload = async () => {
    if (!uploadFile) {
      setValidationError("请选择要上传的文件");
      return;
    }

    setExecutingAction(TicketAction.UPLOAD_SIGNATURE);

    try {
      const formData = new FormData();
      formData.append("action", TicketAction.UPLOAD_SIGNATURE);
      formData.append("signedPhoto", uploadFile);

      const actionResponse = await fetch(`/api/tickets/${ticket.id}/workflow-action`, {
        method: "POST",
        body: formData,
      });

      const actionResult = await actionResponse.json();

      if (!actionResponse.ok || !actionResult.success) {
        setValidationError(actionResult.message || "操作失败");
        return;
      }

      // 操作成功
      setShowUploadDialog(false);
      if (onActionSuccess) {
        onActionSuccess();
      }
    } catch (error: unknown) {
      console.error("[TicketActionBar] 文件上传失败:", error);
      setValidationError(error instanceof Error ? error.message : "网络错误，请稍后重试");
    } finally {
      setExecutingAction(null);
    }
  };

  /**
   * 处理文件选择
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);

    // 生成预览
    const reader = new FileReader();
    reader.onload = () => {
      setUploadPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // ==================== 渲染 ====================

  return (
    <>
      <Card className={cn("border-l-4 border-l-blue-500", className)}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-blue-500" />
            工作流操作
          </CardTitle>
          <CardDescription>
            当前状态：{normalizeTicketStatus(ticket.status) 
              ? TICKET_STATUS_LABELS[normalizeTicketStatus(ticket.status)!] 
              : ticket.status}；可执行 {availableTransitions.length} 个动作
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 验证错误提示 */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {availableTransitions.map((transition) => {
            const validationResult = transition.requiresValidation && transition.validationKey
              ? runValidation(transition.validationKey, ticket)
              : { valid: true };
            const nextStatusLabel = normalizeTicketStatus(transition.nextStatus)
              ? TICKET_STATUS_LABELS[normalizeTicketStatus(transition.nextStatus)!]
              : transition.nextStatus;

            return (
              <div key={transition.action} className="space-y-2 rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">
                  执行后进入：{nextStatusLabel}
                </div>
                {!validationResult.valid && validationResult.message && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{validationResult.message}</AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={() => handleExecuteAction(transition.action)}
                  disabled={!validationResult.valid || executingAction !== null}
                  className="w-full"
                  size="lg"
                >
                  {executingAction === transition.action && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {TICKET_ACTION_LABELS[transition.action]}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 文件上传对话框（用于上传签字凭证） */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传签字凭证</DialogTitle>
            <DialogDescription>
              请上传已签字的维修报告照片或PDF文件
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid w-full gap-1.5">
              <Label htmlFor="signature-file">选择文件</Label>
              <Input
                id="signature-file"
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                disabled={executingAction !== null}
              />
            </div>

            {/* 图片预览 */}
            {uploadPreview && (
              <div className="border rounded-lg p-4">
                <img
                  src={uploadPreview}
                  alt="签字凭证预览"
                  className="max-h-64 mx-auto"
                />
              </div>
            )}

            {/* 错误提示 */}
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadDialog(false)}
              disabled={executingAction !== null}
            >
              取消
            </Button>
            <Button onClick={handleFileUpload} disabled={!uploadFile || executingAction !== null}>
              {executingAction === TicketAction.UPLOAD_SIGNATURE && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Upload className="mr-2 h-4 w-4" />
              上传并提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
