"use client";

import { useState } from "react";
import { useRepairContext } from "@/context/RepairContext";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, AlertCircle, CheckCircle, Clock, X, ArrowLeft, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import CreateTicketForm from "@/components/create-ticket-form";
import RepairDetailWrapper from "@/components/repair-detail-wrapper";
import { TICKET_STATUS_LABELS, TicketStatus, UserRole } from "@/lib/enums";
import { WorkOrderFilterBar } from "@/components/work-order-filter-bar";
import { WorkOrderCardStack } from "@/components/work-order-card-stack";
import { WorkOrderCardColumns } from "@/components/work-order-card-columns";
import { ALL_REPAIR_STATUS_FILTER, matchesRepairListFilters, REPAIR_STATUS_FILTER_OPTIONS } from "@/lib/repair-list-filters";

export default function RepairsPage() {
  const { repairs, updateRepair, deleteRepair } = useRepairContext();
  const { user } = useAuth();
  const router = useRouter();
  const [workOrderQuery, setWorkOrderQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_REPAIR_STATUS_FILTER);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);

  const filteredRepairs = repairs.filter((repair) => matchesRepairListFilters(repair, {
    workOrderQuery,
    customerQuery,
    deviceQuery,
    status: filterStatus,
  }));

  // 获取状态徽章（支持新状态）
  const getStatusBadge = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    
    // 获取状态标签
    const statusKey = Object.keys(TICKET_STATUS_LABELS).find(
      key => key.toLowerCase() === normalizedStatus
    ) as TicketStatus | undefined;
    
    const label = statusKey ? TICKET_STATUS_LABELS[statusKey] : status;
    
    switch (normalizedStatus) {
      case "pending":
      case "created":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">{label}</Badge>;
      case "processing":
      case "in_repair":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">{label}</Badge>;
      case "pending_factory":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">{label}</Badge>;
      case "factory_finished":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">{label}</Badge>;
      case "admin_review":
        return <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300 text-xs">{label}</Badge>;
      case "pending_shipment":
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 text-xs">{label}</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">{label}</Badge>;
      case "unrepairable":
        return <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">{label}</Badge>;
      case "delayed":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">{label}</Badge>;
      default:
        return <Badge className="text-xs">{label}</Badge>;
    }
  };

  // 获取优先级徽章
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "low":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">低</Badge>;
      case "medium":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">中</Badge>;
      case "high":
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">高</Badge>;
      case "critical":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">紧急</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  // 检查设备是否在保修期内（已废弃，保留兼容性）
  const isDeviceInWarranty = (device: any) => {
    if (!device?.warrantyEnd) return false;
    
    const today = new Date();
    const warrantyEnd = new Date(device.warrantyEnd);
    return warrantyEnd > today;
  };

  return (
    <div className="h-dvh min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="container mx-auto py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              // 根据用户角色返回相应页面
              if (user?.role === UserRole.BUSINESS) {
                router.push("/business");
              } else if (user?.role === UserRole.ADMIN) {
                router.push("/admin/users");
              } else if (user?.role === UserRole.WAREHOUSE) {
                router.push("/warehouse/dashboard");
              } else {
                router.push("/");
              }
            }}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">维修工单管理</h1>
            <p className="text-muted-foreground mt-1">管理和跟踪设备维修工单</p>
          </div>
          <div className="flex gap-2">
          {/* 管理员和仓库管理员可以导出Excel */}
          {(user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) && (
            <Button 
              variant="outline"
              onClick={() => {
                window.open("/api/tickets/export", "_blank");
              }}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              导出Excel
            </Button>
          )}
          {/* 管理员不需要新建工单，只有现场人员和维修人员可以创建 */}
          {user?.role !== UserRole.ADMIN && (
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              新建工单
            </Button>
          )}
          </div>
        </div>

        <WorkOrderFilterBar
          className="mb-6"
          workOrderQuery={workOrderQuery}
          customerQuery={customerQuery}
          deviceQuery={deviceQuery}
          status={filterStatus}
          statusOptions={REPAIR_STATUS_FILTER_OPTIONS}
          onWorkOrderQueryChange={setWorkOrderQuery}
          onCustomerQueryChange={setCustomerQuery}
          onDeviceQueryChange={setDeviceQuery}
          onStatusChange={setFilterStatus}
        />

      {/* 简化的工单列表 - 卡片式布局 */}
      {filteredRepairs.length > 0 ? (
        <WorkOrderCardStack>
          {filteredRepairs.map((repair) => (
            <Card
              key={repair.id}
              className="cursor-pointer"
              onClick={() => setSelectedRepairId(repair.id)}
            >
              <CardContent className="p-4">
                <WorkOrderCardColumns
                  workOrder={(
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold">
                          工单号：{repair.workOrderNumber || repair.id}
                        </h3>
                        {repair.batchId && (
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-xs text-blue-700">批次</Badge>
                        )}
                      </div>
                      {repair.batchId && (
                        <p
                          className="cursor-pointer truncate text-xs text-blue-600 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/batch/${repair.batchId}`);
                          }}
                        >
                          批次号：{repair.batchId}
                        </p>
                      )}
                    </div>
                  )}
                  customer={(
                    <div className="space-y-1 text-sm">
                      <p className="truncate"><span className="text-muted-foreground">客户：</span>{repair.customerName || "未填写客户"}</p>
                      <p className="truncate text-muted-foreground">用户：{repair.reportedBy || repair.reportedByUsername || "未填写用户"}</p>
                    </div>
                  )}
                  project={(
                    <p className="truncate text-sm"><span className="text-muted-foreground">项目：</span>{repair.projectName || repair.projectLocation || "未填写项目"}</p>
                  )}
                  model={(
                    <div className="space-y-1 text-sm">
                      <p className="truncate"><span className="text-muted-foreground">型号：</span>{repair.deviceModel || repair.deviceName || "未填写"}</p>
                      <p className="truncate text-xs text-muted-foreground">故障：{repair.problem || "未填写"}</p>
                    </div>
                  )}
                  serial={(
                    <p className="truncate text-sm"><span className="text-muted-foreground">SN：</span>{repair.deviceSerialNumber || "未填写"}</p>
                  )}
                  status={(
                    <div>{getStatusBadge(repair.status)}</div>
                  )}
                  meta={(
                    <div className="flex items-center justify-between gap-3 xl:justify-end">
                      <p className="whitespace-nowrap text-xs text-muted-foreground">{repair.reportedAt}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRepairId(repair.id);
                        }}
                      >
                        查看详情
                      </Button>
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          ))}
        </WorkOrderCardStack>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">未找到匹配的工单</p>
              <p className="text-sm text-muted-foreground mt-2">请尝试调整搜索条件</p>
            </CardContent>
          </Card>
        )}

        {/* 添加工单对话框（新建工单表单，直接写入 SQL Server） */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>新建维修工单</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <CreateTicketForm onSuccess={() => setIsAddDialogOpen(false)} onCancel={() => setIsAddDialogOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* 工单详情对话框 */}
      {selectedRepairId && (
        <Dialog open={!!selectedRepairId} onOpenChange={(open) => !open && setSelectedRepairId(null)}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>工单详情</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <RepairDetailWrapper 
                taskId={selectedRepairId} 
                onBack={() => setSelectedRepairId(null)} 
              />
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>
    </div>
  );
}
