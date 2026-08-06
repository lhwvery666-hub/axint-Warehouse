"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserRole, TicketStatus, normalizeTicketStatus, TICKET_STATUS_LABELS } from "@/lib/enums";
import { 
  ArrowLeft,
  Loader2,
  ChevronRight,
  Package,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import BusinessBatchReview from "@/components/business-batch-review";
import { WorkOrderFilterBar } from "@/components/work-order-filter-bar";
import { WorkOrderCardStack } from "@/components/work-order-card-stack";
import { WorkOrderPagination } from "@/components/work-order-pagination";
import { BatchWorkOrderCardContent } from "@/components/batch-work-order-card-content";
import { ALL_REPAIR_STATUS_FILTER, matchesRepairListFilters, REPAIR_STATUS_FILTER_OPTIONS } from "@/lib/repair-list-filters";
import { clampPage, paginateItems } from "@/lib/pagination";

interface BatchTicket {
  batchId: string;
  projectName: string;
  projectLocation: string;
  deviceCount: number;
  category: string;
  clientName?: string | null;
  customerName?: string;
  reportedBy?: string;
  reportedByUsername?: string;
  reportedByUserId?: string;
  deviceSerials?: string;
  deviceModels?: string;
  statuses?: string;
  createdAt: string;
  status: string;
}

export default function BusinessRepairsPage() {
  const { user, status: authStatus } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [batches, setBatches] = useState<BatchTicket[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [workOrderQuery, setWorkOrderQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_REPAIR_STATUS_FILTER);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const response = await fetch("/api/tickets/all-batches");
      const result = await response.json();

      if (result.success) {
        setBatches(result.data || []);
      }
    } catch (error) {
      console.error("加载批次工单失败:", error);
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "loading") return;
    
    if (authStatus === "unauthenticated" || user?.role !== UserRole.BUSINESS) {
      router.push("/login");
      return;
    }
    
    setIsAuthorized(true);
  }, [authStatus, user, router]);

  useEffect(() => {
    if (isAuthorized) {
      void loadBatches();
    }
  }, [isAuthorized, loadBatches]);

  const filteredBatches = batches.filter((batch) => matchesRepairListFilters(batch, {
    workOrderQuery,
    customerQuery,
    deviceQuery,
    status: filterStatus,
  }));
  const paginatedBatches = paginateItems(filteredBatches, currentPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [workOrderQuery, customerQuery, deviceQuery, filterStatus]);

  useEffect(() => {
    setCurrentPage((page) => clampPage(page, filteredBatches.length));
  }, [filteredBatches.length]);

  // ⚠️ 曾经的 bug：直接用原始字符串 status 与 TicketStatus 枚举做 switch 比较，一旦大小写/格式不完全
  // 一致就全部落到 default 分支。修复：先用 normalizeTicketStatus 归一化后再匹配，并补充仓库已确认状态。
  const getStatusBadge = (status: string) => {
    const normalized = normalizeTicketStatus(status)
    switch (normalized) {
      case TicketStatus.CREATED:
        return (
          <Badge variant="outline" className="bg-yellow-50 border-yellow-300 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            待处理
          </Badge>
        );
      case TicketStatus.WAREHOUSE_CONFIRMING:
        return (
          <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800">
            <Package className="w-3 h-3 mr-1" />
            待仓库确认
          </Badge>
        );
      case TicketStatus.WAREHOUSE_CONFIRMED:
        return (
          <Badge variant="outline" className="bg-emerald-50 border-emerald-300 text-emerald-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            仓库已确认
          </Badge>
        );
      case TicketStatus.IN_REPAIR:
        return (
          <Badge variant="outline" className="bg-cyan-50 border-cyan-300 text-cyan-800">
            <TrendingUp className="w-3 h-3 mr-1" />
            维修检查中
          </Badge>
        );
      case TicketStatus.TECHNICIAN_REPAIRING:
        return (
          <Badge variant="outline" className="bg-indigo-50 border-indigo-300 text-indigo-800">
            <TrendingUp className="w-3 h-3 mr-1" />
            维修作业中
          </Badge>
        );
      case TicketStatus.PENDING_REPORTER_CONFIRM:
        return (
          <Badge variant="outline" className="bg-cyan-50 border-cyan-300 text-cyan-800">
            <Clock className="w-3 h-3 mr-1" />
            待现场确认
          </Badge>
        );
      case TicketStatus.BUSINESS_REVIEW:
        return (
          <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-800">
            <DollarSign className="w-3 h-3 mr-1" />
            待商务审核
          </Badge>
        );
      case TicketStatus.WAREHOUSE_SHIPPING:
        return (
          <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-800">
            <Package className="w-3 h-3 mr-1" />
            待发货
          </Badge>
        );
      case TicketStatus.COMPLETED:
        return (
          <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            已完成
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <AlertCircle className="w-3 h-3 mr-1" />
            {normalized ? TICKET_STATUS_LABELS[normalized] : status}
          </Badge>
        );
    }
  };

  if (authStatus === "loading" || !isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 如果选择了批次，显示审核界面
  if (selectedBatchId) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto py-8 px-6">
          <BusinessBatchReview
            batchId={selectedBatchId}
            onBack={() => {
              setSelectedBatchId(null);
              loadBatches();
            }}
            onCompleted={() => {
              setSelectedBatchId(null);
              loadBatches();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6 space-y-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">维修工单管理</h1>
            <p className="text-muted-foreground mt-2">
              管理和跟踪所有维修工单
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => router.push("/business")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回控制台
          </Button>
        </div>

        <WorkOrderFilterBar
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

        {/* 批次工单列表 */}
        {loadingBatches ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">加载中...</span>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {(workOrderQuery || customerQuery || deviceQuery || filterStatus !== ALL_REPAIR_STATUS_FILTER) ? "未找到匹配的工单" : "暂无批次工单"}
            </p>
          </div>
        ) : (
          <>
            <WorkOrderCardStack>
              {paginatedBatches.map((batch) => (
              <Card
                key={`batch-${batch.batchId}`}
                className="cursor-pointer"
                onClick={() => setSelectedBatchId(batch.batchId)}
              >
                <BatchWorkOrderCardContent
                  batchId={batch.batchId}
                  deviceCount={batch.deviceCount}
                  customerName={batch.customerName || batch.clientName}
                  projectName={batch.projectName}
                  projectLocation={batch.projectLocation}
                  reportedBy={batch.reportedBy}
                  reportedByUsername={batch.reportedByUsername}
                  deviceSerials={batch.deviceSerials}
                  deviceModels={batch.deviceModels}
                  category={batch.category}
                  statusNode={getStatusBadge(batch.status)}
                  createdAt={`创建时间：${format(new Date(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}`}
                  trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                />
              </Card>
              ))}
            </WorkOrderCardStack>
            <WorkOrderPagination
              currentPage={currentPage}
              totalItems={filteredBatches.length}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
