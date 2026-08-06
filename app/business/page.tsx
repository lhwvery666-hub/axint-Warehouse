"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserRole, TicketStatus, normalizeTicketStatus, TICKET_STATUS_LABELS } from "@/lib/enums";
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  ChevronRight,
  DollarSign,
  Loader2,
  TrendingUp,
  RefreshCw,
  Receipt,
  Info,
} from "lucide-react";
import { useRepairContext } from "@/context/RepairContext";
import BusinessBatchReview from "@/components/business-batch-review";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { WorkOrderFilterBar } from "@/components/work-order-filter-bar";
import { WorkOrderCardStack } from "@/components/work-order-card-stack";
import { WorkOrderPagination } from "@/components/work-order-pagination";
import { BatchWorkOrderCardContent } from "@/components/batch-work-order-card-content";
import { ALL_REPAIR_STATUS_FILTER, matchesFinancialFollowupFilters, matchesRepairListFilters, REPAIR_STATUS_FILTER_OPTIONS } from "@/lib/repair-list-filters";
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

interface FollowupBatchTicket extends BatchTicket {
  clientName: string | null;
  contactInfo: string | null;
  isPaymentReceived: number;
  isInvoiced: number;
  totalCost: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
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
  const [workOrderQuery, setWorkOrderQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_REPAIR_STATUS_FILTER);
  const [currentPage, setCurrentPage] = useState(1);

  // ── 待审核批次（待审核批次 Tab 使用） ─────────────────────────────────────────
  const [pendingBatches, setPendingBatches] = useState<BatchTicket[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // ── 财务跟进批次（财务跟进 Tab 使用）：已授权发货但收款/开票未结清 ──────────────
  const [followupBatches, setFollowupBatches] = useState<FollowupBatchTicket[]>([]);
  const [loadingFollowup, setLoadingFollowup] = useState(false);
  const [followupFilters, setFollowupFilters] = useState({
    pendingShipment: false,
    unpaid: false,
    notInvoiced: false,
  });

  // ── 选中批次打开审核详情 ──────────────────────────────────────────────────────
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // ── 统计数据 ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ totalTickets: 0, adminReviewTickets: 0, followupTickets: 0 });

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || user?.role !== UserRole.BUSINESS) {
      router.push("/login");
      return;
    }
    setIsAuthorized(true);
  }, [status, user, router]);

  // 统计数据：总工单数来自 RepairContext，待审批数直接从 API 获取（避免状态映射不准确）
  useEffect(() => {
    if (!isAuthorized || !repairs) return;
    setStats((prev) => ({ ...prev, totalTickets: repairs.length }));
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
      if (result.success) {
        const batches = result.data || [];
        setPendingBatches(batches);
        // 待审批数量直接用 API 返回的实际数据
        setStats((prev) => ({ ...prev, adminReviewTickets: batches.length }));
      }
    } catch (e) {
      console.error("加载待审核批次失败:", e);
    } finally {
      setLoadingPending(false);
    }
  };

  // 加载财务跟进批次（财务跟进 Tab）
  const loadFollowupBatches = async () => {
    setLoadingFollowup(true);
    try {
      const res = await fetch("/api/tickets/business-financial-followup");
      const result = await res.json();
      if (result.success) {
        const batches = result.data || [];
        setFollowupBatches(batches);
        setStats((prev) => ({ ...prev, followupTickets: batches.length }));
      }
    } catch (e) {
      console.error("加载财务跟进批次失败:", e);
    } finally {
      setLoadingFollowup(false);
    }
  };

  // 授权后立即加载待审批/待跟进数量（统计卡片、Tab 徽标）
  useEffect(() => {
    if (!isAuthorized) return;
    loadPendingBatches();
    loadFollowupBatches();
  }, [isAuthorized]);

  // Tab 切换时懒加载（数据总览）
  useEffect(() => {
    if (!isAuthorized) return;
    if (activeTab === "overview") loadAllBatches();
    if (activeTab === "pending") loadPendingBatches();
    if (activeTab === "followup") loadFollowupBatches();
  }, [activeTab]);

  // ── 工单状态徽章 ──────────────────────────────────────────────────────────────
  // ⚠️ 曾经的 bug：直接用原始字符串 s 与 TicketStatus 枚举做 switch 比较，一旦后端返回的大小写/格式
  // 与枚举字面量不完全一致（如全小写的 "warehouse_confirming"），就会全部落到 default 分支。
  // 修复：先用 normalizeTicketStatus 归一化，保证无论后端传什么格式都能正确匹配。
  const getStatusBadge = (s: string) => {
    const normalized = normalizeTicketStatus(s)
    switch (normalized) {
      case TicketStatus.CREATED:
        return <Badge variant="outline" className="bg-yellow-50 border-yellow-300 text-yellow-800"><Clock className="w-3 h-3 mr-1" />待处理</Badge>;
      case TicketStatus.WAREHOUSE_CONFIRMING:
        return <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800"><Package className="w-3 h-3 mr-1" />待仓库确认</Badge>;
      case TicketStatus.WAREHOUSE_CONFIRMED:
        return <Badge variant="outline" className="bg-emerald-50 border-emerald-300 text-emerald-800"><CheckCircle className="w-3 h-3 mr-1" />仓库已确认</Badge>;
      case TicketStatus.IN_REPAIR:
        return <Badge variant="outline" className="bg-cyan-50 border-cyan-300 text-cyan-800"><TrendingUp className="w-3 h-3 mr-1" />维修检查中</Badge>;
      case TicketStatus.TECHNICIAN_REPAIRING:
        return <Badge variant="outline" className="bg-indigo-50 border-indigo-300 text-indigo-800"><TrendingUp className="w-3 h-3 mr-1" />维修作业中</Badge>;
      case TicketStatus.PENDING_REPORTER_CONFIRM:
        return <Badge variant="outline" className="bg-cyan-50 border-cyan-300 text-cyan-800"><Clock className="w-3 h-3 mr-1" />待现场确认</Badge>;
      case TicketStatus.BUSINESS_REVIEW:
        return <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-800"><DollarSign className="w-3 h-3 mr-1" />待商务审核</Badge>;
      case TicketStatus.WAREHOUSE_SHIPPING:
        return <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-800"><Package className="w-3 h-3 mr-1" />待发货</Badge>;
      case TicketStatus.COMPLETED:
        return <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />已完成</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />{normalized ? TICKET_STATUS_LABELS[normalized] : s}</Badge>;
    }
  };

  const filteredBatches = allBatches.filter((batch) => matchesRepairListFilters(batch, {
    workOrderQuery,
    customerQuery,
    deviceQuery,
    status: filterStatus,
  }));
  const filteredFollowupBatches = followupBatches.filter((batch) =>
    matchesFinancialFollowupFilters(batch, followupFilters),
  );
  const activeFilteredCount = activeTab === "overview"
    ? filteredBatches.length
    : activeTab === "pending"
      ? pendingBatches.length
      : activeTab === "followup"
        ? filteredFollowupBatches.length
        : 0;
  const paginatedBatches = paginateItems(filteredBatches, currentPage);
  const paginatedPendingBatches = paginateItems(pendingBatches, currentPage);
  const paginatedFollowupBatches = paginateItems(filteredFollowupBatches, currentPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, workOrderQuery, customerQuery, deviceQuery, filterStatus, followupFilters]);

  useEffect(() => {
    setCurrentPage((page) => clampPage(page, activeFilteredCount));
  }, [activeFilteredCount]);

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
              loadFollowupBatches();
            }}
            onCompleted={() => {
              setSelectedBatchId(null);
              loadAllBatches();
              loadPendingBatches();
              loadFollowupBatches();
            }}
          />
        </div>
      </div>
    );
  }

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
            onClick={() => { loadAllBatches(); loadPendingBatches(); loadFollowupBatches(); }}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            刷新数据
          </Button>
        </div>

        {/* ── 核心统计卡片 ─────────────────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-3 max-w-4xl">
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

          {/* 财务跟进 */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab("followup")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">财务跟进</CardTitle>
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Receipt className="h-4 w-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{stats.followupTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">待发货或未结清收款/开票</p>
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
          <TabsList className="grid w-full md:w-auto grid-cols-3">
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
            <TabsTrigger value="followup" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              财务跟进
              {stats.followupTickets > 0 && (
                <Badge variant="destructive" className="ml-1">{stats.followupTickets}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1：所有工单列表 ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
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
              <>
                <WorkOrderCardStack>
                  {paginatedPendingBatches.map((batch) => (
                  <Card
                    key={`pending-${batch.batchId}`}
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
                      statusNode={(
                        <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-800">
                          <DollarSign className="w-3 h-3 mr-1" />待商务审核
                        </Badge>
                      )}
                      createdAt={`创建时间：${format(new Date(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}`}
                      trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    />
                  </Card>
                  ))}
                </WorkOrderCardStack>
                <WorkOrderPagination
                  currentPage={currentPage}
                  totalItems={pendingBatches.length}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </TabsContent>

          {/* ── Tab 3：财务跟进 ─────────────────────────────────────────────────── */}
          <TabsContent value="followup" className="space-y-4">
            <Alert className="flex flex-wrap items-center gap-3">
              <Info className="h-4 w-4 shrink-0" />
              <AlertDescription className="min-w-0 flex-1">
                以下批次已授权发货（或已完成），但收款/开票尚未结清，请跟进后在批次详情里补充信息。免费维修批次不会出现在此列表。
              </AlertDescription>
              <div className="flex flex-wrap items-center gap-2" aria-label="财务跟进筛选">
                <span className="mr-1 text-xs text-muted-foreground">多选为“且”</span>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent">
                  <Checkbox
                    checked={followupFilters.pendingShipment}
                    onCheckedChange={(checked) => setFollowupFilters((current) => ({
                      ...current,
                      pendingShipment: checked === true,
                    }))}
                  />
                  待发货
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent">
                  <Checkbox
                    checked={followupFilters.unpaid}
                    onCheckedChange={(checked) => setFollowupFilters((current) => ({
                      ...current,
                      unpaid: checked === true,
                    }))}
                  />
                  未收款
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent">
                  <Checkbox
                    checked={followupFilters.notInvoiced}
                    onCheckedChange={(checked) => setFollowupFilters((current) => ({
                      ...current,
                      notInvoiced: checked === true,
                    }))}
                  />
                  未开票
                </label>
              </div>
            </Alert>
            {loadingFollowup ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">加载中...</span>
              </div>
            ) : filteredFollowupBatches.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p className="text-muted-foreground">
                  {followupBatches.length === 0 ? "暂无需要跟进的财务事项" : "暂无符合所选条件的财务事项"}
                </p>
              </div>
            ) : (
              <>
                <WorkOrderCardStack>
                  {paginatedFollowupBatches.map((batch) => (
                  <Card
                    key={`followup-${batch.batchId}`}
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
                      statusNode={(
                        <div className="flex flex-wrap gap-1">
                          {getStatusBadge(batch.status)}
                          <Badge variant="outline" className={batch.isPaymentReceived ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-800"}>
                            {batch.isPaymentReceived ? "已收款" : "未收款"}
                          </Badge>
                          <Badge variant="outline" className={batch.isInvoiced ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-800"}>
                            {batch.isInvoiced ? "已开票" : "未开票"}
                          </Badge>
                        </div>
                      )}
                      statusDetails={`金额：${batch.totalCost ? `¥${batch.totalCost}` : "—"}`}
                      createdAt={`创建时间：${format(new Date(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}`}
                      trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    />
                  </Card>
                  ))}
                </WorkOrderCardStack>
                <WorkOrderPagination
                  currentPage={currentPage}
                  totalItems={filteredFollowupBatches.length}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
