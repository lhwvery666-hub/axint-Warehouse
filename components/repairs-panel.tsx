"use client";

import { useState, useEffect } from "react";
import { useRepairContext } from "@/context/RepairContext";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, AlertCircle, X, Download } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import CreateTicketForm from "@/components/create-ticket-form";
import RepairDetail from "@/components/repair-detail";
import { cn } from "@/lib/utils";

interface RepairsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RepairsPanel({ isOpen, onClose }: RepairsPanelProps) {
  const { repairs } = useRepairContext();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 从URL参数获取状态筛选
  useEffect(() => {
    const status = searchParams.get("status");
    if (status) {
      setStatusFilter(status);
    } else {
      // 如果没有URL参数，检查window.location
      const urlParams = new URLSearchParams(window.location.search);
      const urlStatus = urlParams.get("status");
      if (urlStatus) {
        setStatusFilter(urlStatus);
      }
    }
  }, [searchParams, isOpen]);

  // 过滤维修工单
  const filteredRepairs = repairs.filter(repair => {
    // 状态筛选
    const statusMatch = statusFilter === "all" || 
      repair.status?.toLowerCase() === statusFilter.toLowerCase() ||
      repair.status?.toLowerCase() === statusFilter.replace("_", "").toLowerCase();
    
    // 搜索筛选
    const searchMatch = searchQuery === "" ||
      repair.deviceName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repair.deviceModel?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repair.problem?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repair.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repair.deviceSerialNumber?.toLowerCase().includes(searchQuery.toLowerCase());

    return statusMatch && searchMatch;
  });

  // 获取状态徽章
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
      case "cancelled":
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300 text-xs">已取消</Badge>;
      case "scrapped":
        return <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">已报废</Badge>;
      case "return_unrepaired":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">拒修退回</Badge>;
      default:
        return <Badge className="text-xs">{status}</Badge>;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 右侧面板 */}
      <div className="fixed right-0 top-0 h-screen w-[600px] bg-card border-l border-border shadow-xl z-50 flex flex-col">
        {/* 面板头部 */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">工单管理</h2>
            <p className="text-xs text-muted-foreground">查看和管理所有维修工单</p>
          </div>
          <div className="flex items-center gap-2">
            {(user?.role === "admin" || user?.role === "warehouse") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open("/api/tickets/export", "_blank");
                }}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                导出
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 搜索和筛选 */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索工单..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
              className="text-xs"
            >
              全部
            </Button>
            <Button
              variant={statusFilter === "admin_review" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("admin_review")}
              className="text-xs"
            >
              待商务处理
            </Button>
            <Button
              variant={statusFilter === "pending_shipment" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("pending_shipment")}
              className="text-xs"
            >
              待发货
            </Button>
            <Button
              variant={statusFilter === "in_repair" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("in_repair")}
              className="text-xs"
            >
              维修中
            </Button>
            <Button
              variant={statusFilter === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("completed")}
              className="text-xs"
            >
              已完成
            </Button>
          </div>
        </div>

        {/* 工单列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredRepairs.length > 0 ? (
            filteredRepairs.map((repair) => (
              <Card
                key={repair.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedRepairId(repair.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground">工单 #{repair.id}</span>
                        {getStatusBadge(repair.status || "")}
                      </div>
                      <h3 className="font-semibold text-sm mb-1 truncate">
                        {repair.deviceName || "未知设备"}
                      </h3>
                      <p className="text-xs text-muted-foreground mb-2 truncate">
                        {repair.deviceModel || ""}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 mb-3">
                    <div className="flex items-start gap-2 text-xs">
                      <AlertCircle className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-muted-foreground line-clamp-2 flex-1">
                        {repair.problem || "无故障描述"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>📍 {repair.location || "未知位置"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {repair.reportedAt || ""}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-medium">未找到匹配的工单</p>
              <p className="text-sm text-muted-foreground mt-2">请尝试调整搜索条件</p>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        {user?.role !== "admin" && (
          <div className="p-4 border-t border-border">
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="w-full"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              新建工单
            </Button>
          </div>
        )}
      </div>

      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* 添加工单对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>新建维修工单</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <CreateTicketForm
              onSuccess={() => setIsAddDialogOpen(false)}
              onCancel={() => setIsAddDialogOpen(false)}
            />
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
    </>
  );
}
