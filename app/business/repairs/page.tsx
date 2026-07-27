"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserRole, TicketStatus, normalizeTicketStatus, TICKET_STATUS_LABELS } from "@/lib/enums";
import { 
  ArrowLeft,
  Search,
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

interface BatchTicket {
  batchId: string;
  projectName: string;
  projectLocation: string;
  deviceCount: number;
  category: string;
  createdAt: string;
  status: string;
}

export default function BusinessRepairsPage() {
  const { user, status: authStatus } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [batches, setBatches] = useState<BatchTicket[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

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
      loadBatches();
    }
  }, [isAuthorized]);

  const loadBatches = async () => {
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
  };

  const filteredBatches = batches.filter(batch => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      batch.batchId.toLowerCase().includes(q) ||
      (batch.projectName || "").toLowerCase().includes(q) ||
      (batch.projectLocation || "").toLowerCase().includes(q)
    );
  });

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

        {/* 搜索栏 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索工单号、批次号、序列号或故障描述..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

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
              {searchQuery ? "未找到匹配的工单" : "暂无批次工单"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredBatches.map((batch, index) => (
              <Card 
                key={`batch-${batch.batchId}-${index}`} 
                className="hover:border-primary/50 transition-colors cursor-pointer" 
                onClick={() => setSelectedBatchId(batch.batchId)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{batch.batchId}</h3>
                        {getStatusBadge(batch.status)}
                        <Badge variant="secondary">
                          {batch.deviceCount} 台设备
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">项目：</span>
                          {batch.projectName || batch.projectLocation}
                        </div>
                        <div>
                          <span className="font-medium">类别：</span>
                          {batch.category}
                        </div>
                        <div>
                          <span className="font-medium">创建时间：</span>
                          {format(new Date(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon">
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
