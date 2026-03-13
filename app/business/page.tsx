"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserRole, TicketStatus } from "@/lib/enums";
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  ChevronRight,
  DollarSign,
  Loader2,
  Search,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { useRepairContext } from "@/context/RepairContext";
import BusinessBatchReview from "@/components/business-batch-review";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface BatchTicket {
  batchId: string;
  projectName: string;
  projectLocation: string;
  deviceCount: number;
  category: string;
  createdAt: string;
  status: string;
}

export default function BusinessDashboard() {
  const { user, status } = useAuth();
  const router = useRouter();
  const { repairs } = useRepairContext();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // ── 工单列表（数据总览 Tab 使用） ────────────────────────────────────────────
  const [allBatches, setAllBatches] = useState<BatchTicket[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── 待审核批次（待审核批次 Tab 使用） ─────────────────────────────────────────
  const [pendingBatches, setPendingBatches] = useState<BatchTicket[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // ── 选中批次打开审核详情 ──────────────────────────────────────────────────────
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // ── 统计数据（只需要两个卡片：待审批 + 总数） ─────────────────────────────────
  const [stats, setStats] = useState({ totalTickets: 0, adminReviewTickets: 0 });

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || user?.role !== UserRole.BUSINESS) {
      router.push("/login");
      return;
    }
    setIsAuthorized(true);
  }, [status, user, router]);

  // 统计数据来自 RepairContext
  useEffect(() => {
    if (!isAuthorized || !repairs) return;
    setStats({
      totalTickets: repairs.length,
      adminReviewTickets: repairs.filter(
        (r) => r.status === "admin_review" || r.status === "business_review"
      ).length,
    });
  }, [isAuthorized, repairs]);

  // 加载全部工单（数据总览 Tab）
  const loadAllBatches = async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch("/api/tickets/all-batches");
      const result = await res.json();
      if (result.success) setAllBatches(result.data || []);
    } catch (e) {
      console.error("加载批次工单失败:", e);
    } finally {
      setLoadingBatches(false);
    }
  };

  // 加载待审核批次（待审核批次 Tab）
  const loadPendingBatches = async () => {
    setLoadingPending(true);
    try {
      const res = await fetch("/api/tickets/business-pending-batches");
      const result = await res.json();
      if (result.success) setPendingBatches(result.data || []);
    } catch (e) {
      console.error("加载待审核批次失败:", e);
    } finally {
      setLoadingPending(false);
    }
  };

  // Tab 切换时懒加载
  useEffect(() => {
    if (!isAuthorized) return;
    if (activeTab === "overview") loadAllBatches();
    if (activeTab === "pending") loadPendingBatches();
  }, [activeTab, isAuthorized]);

  // ── 工单状态徽章 ──────────────────────────────────────────────────────────────
  const getStatusBadge = (s: string) => {
    switch (s) {
      case TicketStatus.CREATED:
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 border-yellow-300 text-yellow-800"><Clock className="w-3 h-3 mr-1" />待处理</Badge>;
      case TicketStatus.WAREHOUSE_CONFIRMING:
        return <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800"><Package className="w-3 h-3 mr-1" />待仓库确认</Badge>;
      case TicketStatus.IN_REPAIR:
      case TicketStatus.TECHNICIAN_REPAIRING:
        return <Badge variant="outline" className="bg-cyan-50 border-cyan-300 text-cyan-800"><TrendingUp className="w-3 h-3 mr-1" />维修中</Badge>;
      case TicketStatus.BUSINESS_REVIEW:
      case TicketStatus.ADMIN_REVIEW:
        return <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-800"><DollarSign className="w-3 h-3 mr-1" />待商务审核</Badge>;
      case TicketStatus.WAREHOUSE_SHIPPING:
        return <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-800"><Package className="w-3 h-3 mr-1" />待发货</Badge>;
      case TicketStatus.COMPLETED:
        return <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />已完成</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />{s}</Badge>;
    }
  };

  // ── 加载 / 权限守卫 ───────────────────────────────────────────────────────────
  if (status === "loading" || !isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // ── 打开某个批次审核 ──────────────────────────────────────────────────────────
  if (selectedBatchId) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto py-8 px-6">
          <BusinessBatchReview
            batchId={selectedBatchId}
            onBack={() => {
              setSelectedBatchId(null);
              loadAllBatches();
              loadPendingBatches();
            }}
            onCompleted={() => {
              setSelectedBatchId(null);
              loadAllBatches();
              loadPendingBatches();
            }}
          />
        </div>
      </div>
    );
  }

  const filteredBatches = allBatches.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.batchId.toLowerCase().includes(q) ||
      (b.projectName || "").toLowerCase().includes(q) ||
      (b.projectLocation || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6 space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">商务管理控制台</h1>
            <p className="text-muted-foreground mt-1">
              欢迎回来，{user?.realName || "商务人员"}！这里是您的工单管理概览。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadAllBatches(); loadPendingBatches(); }}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            刷新数据
          </Button>
        </div>

        {/* ── 核心统计卡片（只保留两个） ─────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 max-w-2xl">
          {/* 待商务处理 */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab("pending")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待商务处理</CardTitle>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <DollarSign className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats.adminReviewTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">等待审核的工单</p>
            </CardContent>
          </Card>

          {/* 总工单数 */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总工单数</CardTitle>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">所有工单</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full md:w-auto grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              所有工单
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              待审核批次
              {stats.adminReviewTickets > 0 && (
                <Badge variant="destructive" className="ml-1">{stats.adminReviewTickets}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1：所有工单列表 ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索工单号、批次号、序列号或故障描述..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 列表 */}
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
              <div className="grid gap-3">
                {filteredBatches.map((batch, idx) => (
                  <Card
                    key={`batch-${batch.batchId}-${idx}`}
                    className="hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedBatchId(batch.batchId)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-lg">{batch.batchId}</h3>
                            {getStatusBadge(batch.status)}
                            <Badge variant="secondary">{batch.deviceCount} 台设备</Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                            <div><span className="font-medium">项目：</span>{batch.projectName || batch.projectLocation}</div>
                            <div><span className="font-medium">类别：</span>{batch.category}</div>
                            <div><span className="font-medium">创建时间：</span>{format(new Date(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground ml-2 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Tab 2：待审核批次 ───────────────────────────────────────────────── */}
          <TabsContent value="pending" className="space-y-4">
            {loadingPending ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">加载中...</span>
              </div>
            ) : pendingBatches.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p className="text-muted-foreground">暂无待审核的批次工单</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {pendingBatches.map((batch, idx) => (
                  <Card
                    key={`pending-${batch.batchId}-${idx}`}
                    className="hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedBatchId(batch.batchId)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-lg">{batch.batchId}</h3>
                            <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-800">
                              <DollarSign className="w-3 h-3 mr-1" />待商务审核
                            </Badge>
                            <Badge variant="secondary">{batch.deviceCount} 台设备</Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                            <div><span className="font-medium">项目：</span>{batch.projectName || batch.projectLocation}</div>
                            <div><span className="font-medium">类别：</span>{batch.category}</div>
                            <div><span className="font-medium">创建时间：</span>{format(new Date(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground ml-2 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
