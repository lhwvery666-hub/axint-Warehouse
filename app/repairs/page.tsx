"use client";

import { useState } from "react";
import { useRepairContext } from "@/context/RepairContext";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, AlertCircle, CheckCircle, Clock, X, ArrowLeft, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import CreateTicketForm from "@/components/create-ticket-form";
import RepairDetail from "@/components/repair-detail";

export default function RepairsPage() {
  const { repairs, updateRepair, deleteRepair } = useRepairContext();
  const { user } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);

  // 过滤维修工单
  const filteredRepairs = repairs.filter(repair => 
    repair.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repair.deviceModel.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repair.problem.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repair.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 获取状态徽章（支持新状态）
  const getStatusBadge = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    switch (normalizedStatus) {
      case "pending":
      case "created":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">待处理</Badge>;
      case "processing":
      case "in_repair":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">维修中</Badge>;
      case "pending_factory":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">待返厂</Badge>;
      case "factory_finished":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">待复检</Badge>;
      case "admin_review":
        return <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300 text-xs">待商务处理</Badge>;
      case "pending_shipment":
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 text-xs">待发货</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">已完成</Badge>;
      case "unrepairable":
        return <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">无法维修</Badge>;
      case "delayed":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">已延期</Badge>;
      default:
        return <Badge className="text-xs">{status}</Badge>;
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
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              // 根据用户角色返回相应页面
              if (user?.role === "business") {
                router.push("/business");
              } else if (user?.role === "admin") {
                router.push("/admin/users");
              } else if (user?.role === "warehouse") {
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
          {(user?.role === "admin" || user?.role === "warehouse") && (
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
          {user?.role !== "admin" && (
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              新建工单
            </Button>
          )}
          </div>
        </div>

        {/* 搜索 */}
        <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="搜索工单..." 
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 简化的工单列表 - 卡片式布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRepairs.length > 0 ? (
          filteredRepairs.map((repair) => (
            <Card 
              key={repair.id} 
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedRepairId(repair.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground">工单 #{repair.id}</span>
                      {getStatusBadge(repair.status)}
                    </div>
                    <h3 className="font-semibold text-base mb-1 line-clamp-1">{repair.deviceName}</h3>
                    <p className="text-xs text-muted-foreground mb-2">{repair.deviceModel}</p>
                  </div>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-muted-foreground line-clamp-2 flex-1">{repair.problem}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>📍 {repair.location}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {repair.reportedAt}
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRepairId(repair.id);
                  }}
                >
                  查看详情
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="md:col-span-3 border-dashed">
            <CardContent className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">未找到匹配的工单</p>
              <p className="text-sm text-muted-foreground mt-2">请尝试调整搜索条件</p>
            </CardContent>
          </Card>
        )}
        </div>

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
              <RepairDetail 
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