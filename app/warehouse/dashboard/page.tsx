"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, CheckCircle, Clock, Loader2, ChevronRight, Database, Truck, Download, CheckCircle2, RefreshCw, ArrowRightLeft, FilePenLine } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toBeijingTime } from "@/lib/utils";
import DatabaseManager from "@/components/admin/database-manager";
import WarehouseBatchConfirm from "@/components/warehouse-batch-confirm";
import WarehouseBatchShipping from "@/components/warehouse-batch-shipping";
import WarehouseFactoryTransfer, { type WarehouseFactoryTransferDevice } from "@/components/warehouse-factory-transfer";
import BatchWorkOrderDetail from "@/components/batch-work-order-detail";
import { BatchWorkOrderCardContent } from "@/components/batch-work-order-card-content";
import { WorkOrderCardStack } from "@/components/work-order-card-stack";
import { TicketStatus } from "@/lib/enums";
import { WorkOrderFilterBar } from "@/components/work-order-filter-bar";
import { WorkOrderPagination } from "@/components/work-order-pagination";
import { ALL_REPAIR_STATUS_FILTER, matchesRepairListFilters, REPAIR_STATUS_FILTER_OPTIONS } from "@/lib/repair-list-filters";
import { clampPage, paginateItems } from "@/lib/pagination";
import { toast } from "sonner";

interface PendingBatch {
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
  pendingFactoryDeviceCount?: number;
  createdAt: string;
  status: string;
}

interface PendingCorrectionRequest {
  requestId: number;
  batchId: string;
  createdAt: string | null;
  reason: string;
  impact: "none" | "repair_review" | "warehouse_review";
  changes: Array<{ label: string }>;
  requestedByName: string;
}

export default function WarehouseDashboard() {
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([]);
  const [shippingBatches, setShippingBatches] = useState<PendingBatch[]>([]);
  const [factoryTransferDevices, setFactoryTransferDevices] = useState<WarehouseFactoryTransferDevice[]>([]);
  const [correctionRequests, setCorrectionRequests] = useState<PendingCorrectionRequest[]>([]);
  const [completedBatches, setCompletedBatches] = useState<PendingBatch[]>([]);
  const [allBatches, setAllBatches] = useState<PendingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedFactoryTransferDevice, setSelectedFactoryTransferDevice] = useState<WarehouseFactoryTransferDevice | null>(null);
  const [selectedMode, setSelectedMode] = useState<"confirm" | "shipping" | "view" | "correction">("confirm");
  const [workOrderQuery, setWorkOrderQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_REPAIR_STATUS_FILTER);
  const [currentPage, setCurrentPage] = useState(1);

  const loadPendingBatches = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadErrors((errors) => ({ ...errors, pending: "" }));
    try {
      const response = await fetch("/api/tickets/warehouse-pending-batches", { cache: "no-store" });
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || "加载待确认批次失败");
      }
      setPendingBatches(result.data || []);
      return true;
    } catch (error) {
      console.error("加载待确认批次失败:", error);
      setLoadErrors((errors) => ({ ...errors, pending: "加载失败，请检查连接后重试" }));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShippingBatches = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadErrors((errors) => ({ ...errors, shipping: "" }));
    try {
      const response = await fetch("/api/tickets/warehouse-shipping-batches", { cache: "no-store" });
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || "加载待发货批次失败");
      }
      setShippingBatches(result.data || []);
      return true;
    } catch (error) {
      console.error("加载待发货批次失败:", error);
      setLoadErrors((errors) => ({ ...errors, shipping: "加载失败，请检查连接后重试" }));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFactoryTransferDevices = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadErrors((errors) => ({ ...errors, transfer: "" }));
    try {
      const response = await fetch("/api/tickets/warehouse-factory-transfer-devices", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "加载待移交设备失败");
      }
      setFactoryTransferDevices(result.data || []);
      return true;
    } catch (error: unknown) {
      console.error("加载待移交设备失败:", error);
      setLoadErrors((errors) => ({ ...errors, transfer: "加载失败，请检查连接后重试" }));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCorrectionRequests = useCallback(async (): Promise<boolean> => {
    setCorrectionsLoading(true);
    setLoadErrors((errors) => ({ ...errors, corrections: "" }));
    try {
      const response = await fetch("/api/tickets/correction-requests", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "加载修改申请失败");
      }
      setCorrectionRequests(result.data || []);
      return true;
    } catch (error: unknown) {
      console.error("加载修改申请失败:", error);
      setLoadErrors((errors) => ({ ...errors, corrections: "加载失败，请检查连接后重试" }));
      return false;
    } finally {
      setCorrectionsLoading(false);
    }
  }, []);

  const loadCompletedBatches = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadErrors((errors) => ({ ...errors, completed: "" }));
    try {
      const response = await fetch("/api/tickets/warehouse-completed-batches", { cache: "no-store" });
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || "加载已完成批次失败");
      }
      setCompletedBatches(result.data || []);
      return true;
    } catch (error) {
      console.error("加载已完成批次失败:", error);
      setLoadErrors((errors) => ({ ...errors, completed: "加载失败，请检查连接后重试" }));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllBatches = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadErrors((errors) => ({ ...errors, all: "" }));
    try {
      const response = await fetch("/api/tickets/all-batches", { cache: "no-store" });
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || "加载全部批次失败");
      }
      setAllBatches(result.data || []);
      return true;
    } catch (error) {
      console.error("加载全部批次失败:", error);
      setLoadErrors((errors) => ({ ...errors, all: "加载失败，请检查连接后重试" }));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshActiveTab = useCallback(async (): Promise<boolean> => {
    if (activeTab === "pending") return loadPendingBatches();
    if (activeTab === "shipping") return loadShippingBatches();
    if (activeTab === "transfer") return loadFactoryTransferDevices();
    if (activeTab === "corrections") return loadCorrectionRequests();
    if (activeTab === "completed") return loadCompletedBatches();
    if (activeTab === "all") return loadAllBatches();
    return true;
  }, [activeTab, loadAllBatches, loadCompletedBatches, loadCorrectionRequests, loadFactoryTransferDevices, loadPendingBatches, loadShippingBatches]);

  const closeSelectedBatchAfterRefresh = useCallback(async (workflowSaved: boolean) => {
    const refreshed = await refreshActiveTab();
    setSelectedBatchId(null);
    setSelectedFactoryTransferDevice(null);
    if (!refreshed) {
      toast.error(workflowSaved
        ? "流程已保存，但当前列表刷新失败，请点击刷新按钮重试"
        : "当前列表刷新失败，请点击刷新按钮重试");
    }
  }, [refreshActiveTab]);

  useEffect(() => {
    void loadCorrectionRequests();
  }, [loadCorrectionRequests]);

  useEffect(() => {
    if (activeTab === "pending") {
      void loadPendingBatches();
    } else if (activeTab === "shipping") {
      void loadShippingBatches();
    } else if (activeTab === "transfer") {
      void loadFactoryTransferDevices();
    } else if (activeTab === "corrections") {
      void loadCorrectionRequests();
    } else if (activeTab === "completed") {
      void loadCompletedBatches();
    } else if (activeTab === "all") {
      void loadAllBatches();
    }
  }, [activeTab, loadAllBatches, loadCompletedBatches, loadCorrectionRequests, loadFactoryTransferDevices, loadPendingBatches, loadShippingBatches]);

  const filterWarehouseBatches = (batches: PendingBatch[]) => batches.filter((batch) =>
    matchesRepairListFilters(batch, {
      workOrderQuery,
      customerQuery,
      deviceQuery,
      status: filterStatus,
    }),
  );
  const filteredPendingBatches = filterWarehouseBatches(pendingBatches);
  const filteredShippingBatches = filterWarehouseBatches(shippingBatches);
  const filteredFactoryTransferDevices = filterWarehouseBatches(factoryTransferDevices) as WarehouseFactoryTransferDevice[];
  const filteredCompletedBatches = filterWarehouseBatches(completedBatches);
  const filteredAllBatches = filterWarehouseBatches(allBatches);
  const activeFilteredCount = activeTab === "pending"
    ? filteredPendingBatches.length
    : activeTab === "shipping"
      ? filteredShippingBatches.length
      : activeTab === "transfer"
        ? filteredFactoryTransferDevices.length
      : activeTab === "corrections"
        ? correctionRequests.length
      : activeTab === "completed"
        ? filteredCompletedBatches.length
        : activeTab === "all"
          ? filteredAllBatches.length
          : 0;
  const paginatedPendingBatches = paginateItems(filteredPendingBatches, currentPage);
  const paginatedShippingBatches = paginateItems(filteredShippingBatches, currentPage);
  const paginatedFactoryTransferDevices = paginateItems(filteredFactoryTransferDevices, currentPage);
  const paginatedCorrectionRequests = paginateItems(correctionRequests, currentPage);
  const paginatedCompletedBatches = paginateItems(filteredCompletedBatches, currentPage);
  const paginatedAllBatches = paginateItems(filteredAllBatches, currentPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, workOrderQuery, customerQuery, deviceQuery, filterStatus]);

  useEffect(() => {
    setCurrentPage((page) => clampPage(page, activeFilteredCount));
  }, [activeFilteredCount]);
  const hasActiveFilters = Boolean(
    workOrderQuery.trim() ||
    customerQuery.trim() ||
    deviceQuery.trim() ||
    filterStatus !== ALL_REPAIR_STATUS_FILTER,
  );

  // 如果选择了批次，显示对应的界面
  if (selectedFactoryTransferDevice) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <WarehouseFactoryTransfer
          device={selectedFactoryTransferDevice}
          onBack={() => closeSelectedBatchAfterRefresh(false)}
          onTransferred={() => closeSelectedBatchAfterRefresh(true)}
        />
      </div>
    );
  }

  if (selectedBatchId) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        {selectedMode === "correction" ? (
          <BatchWorkOrderDetail
            batchId={selectedBatchId}
            onBack={() => closeSelectedBatchAfterRefresh(false)}
          />
        ) : selectedMode === "confirm" ? (
          <WarehouseBatchConfirm
            batchId={selectedBatchId}
            onBack={() => closeSelectedBatchAfterRefresh(false)}
            onConfirmed={() => closeSelectedBatchAfterRefresh(true)}
          />
        ) : selectedMode === "shipping" ? (
          <WarehouseBatchShipping
            batchId={selectedBatchId}
            onBack={() => closeSelectedBatchAfterRefresh(false)}
            onCompleted={() => closeSelectedBatchAfterRefresh(true)}
          />
        ) : (
          // 查看已完成批次详情（允许修改发货信息）
          <WarehouseBatchShipping
            batchId={selectedBatchId}
            onBack={() => closeSelectedBatchAfterRefresh(false)}
            onCompleted={() => closeSelectedBatchAfterRefresh(true)}
            allowEdit={true}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">仓库管理工作台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            确认批次设备信息、填写出厂日期、管理设备数据库
          </p>
        </div>
        <Button
          onClick={() => {
            window.open("/api/tickets/export", "_blank");
          }}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          导出Excel表格
        </Button>
      </div>

      <WorkOrderFilterBar
        className="mb-4"
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            待确认批次
          </TabsTrigger>
          <TabsTrigger value="shipping" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            待发货批次
          </TabsTrigger>
          <TabsTrigger value="transfer" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            待移交
          </TabsTrigger>
          <TabsTrigger value="corrections" className="flex items-center gap-2">
            <FilePenLine className="h-4 w-4" />
            修改申请
            {correctionRequests.length > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs">
                {correctionRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            已完成
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            全部工单
          </TabsTrigger>
          <TabsTrigger value="database" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            数据库管理
          </TabsTrigger>
        </TabsList>

        {/* 待确认批次 */}
        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-orange-600" />
                    待确认的批次工单
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    以下批次工单已由现场人员创建，请确认设备信息并填写出厂日期
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadPendingBatches}
                  disabled={loading}
                  className="flex items-center gap-2 shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
              ) : loadErrors.pending ? (
                <div role="alert" className="py-8 space-y-3 text-center"><p className="text-destructive">{loadErrors.pending}</p><Button variant="outline" onClick={() => void loadPendingBatches()}>重新加载</Button></div>
              ) : filteredPendingBatches.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-muted-foreground">
                    {hasActiveFilters ? "未找到匹配的待确认批次" : "暂无待确认的批次工单"}
                  </p>
                </div>
              ) : (
                <>
                  <WorkOrderCardStack>
                    {paginatedPendingBatches.map((batch, index) => {
                    // 调试：打印batch信息
                    if (index === 0) {
                      console.log('[Warehouse Dashboard] 第一个批次数据:', batch)
                    }
                    // 生成唯一key：使用时间戳确保绝对唯一
                    const uniqueKey = `pending-${batch.batchId}`
                    
                    return (
                      <Card key={uniqueKey} className="cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode("confirm");
                      }}>
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
                            <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-800">
                              <Clock className="w-3 h-3 mr-1" />待确认
                            </Badge>
                          )}
                          createdAt={`创建时间：${format(toBeijingTime(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}`}
                          trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        />
                      </Card>
                    )
                    })}
                  </WorkOrderCardStack>
                  <WorkOrderPagination
                    currentPage={currentPage}
                    totalItems={filteredPendingBatches.length}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
          </TabsContent>

        {/* 待发货批次 */}
        <TabsContent value="shipping" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-green-600" />
                待发货的批次工单
              </CardTitle>
              <CardDescription>
                返厂寄出任务优先显示，其余批次待仓库发回客户或完成入库
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
              ) : loadErrors.shipping ? (
                <div role="alert" className="py-8 space-y-3 text-center"><p className="text-destructive">{loadErrors.shipping}</p><Button variant="outline" onClick={() => void loadShippingBatches()}>重新加载</Button></div>
              ) : filteredShippingBatches.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-muted-foreground">
                    {hasActiveFilters ? "未找到匹配的待发货批次" : "暂无待发货的批次工单"}
                  </p>
                </div>
              ) : (
                <>
                  <WorkOrderCardStack>
                    {paginatedShippingBatches.map((batch) => {
                    const uniqueKey = `shipping-${batch.batchId}`
                    const pendingFactoryDeviceCount = Number(batch.pendingFactoryDeviceCount || 0)
                    const hasPendingFactoryDevice = pendingFactoryDeviceCount > 0
                    return (
                      <Card key={uniqueKey} className="cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode("shipping");
                      }}>
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
                            <Badge
                              variant="outline"
                              className={hasPendingFactoryDevice
                                ? "bg-orange-50 border-orange-300 text-orange-800"
                                : "bg-green-50 border-green-300 text-green-800"}
                            >
                              <Truck className="w-3 h-3 mr-1" />
                              {hasPendingFactoryDevice
                                ? `返厂待发货（${pendingFactoryDeviceCount} 台）`
                                : "待发货"}
                            </Badge>
                          )}
                          createdAt={`创建时间：${format(toBeijingTime(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}`}
                          trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        />
                      </Card>
                    )
                    })}
                  </WorkOrderCardStack>
                  <WorkOrderPagination
                    currentPage={currentPage}
                    totalItems={filteredShippingBatches.length}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 返厂设备待移交 */}
        <TabsContent value="transfer" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRightLeft className="h-5 w-5 text-amber-600" />
                    返厂设备待移交
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    仓库跟进厂家维修与返程物流；收到设备并核对后，按单台移交维修人员继续完成维修
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadFactoryTransferDevices}
                  disabled={loading}
                  className="flex shrink-0 items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
              ) : loadErrors.transfer ? (
                <div role="alert" className="py-8 space-y-3 text-center"><p className="text-destructive">{loadErrors.transfer}</p><Button variant="outline" onClick={() => void loadFactoryTransferDevices()}>重新加载</Button></div>
              ) : filteredFactoryTransferDevices.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
                  <p className="text-muted-foreground">
                    {hasActiveFilters ? "未找到匹配的待移交设备" : "暂无待移交的返厂设备"}
                  </p>
                </div>
              ) : (
                <>
                  <WorkOrderCardStack>
                    {paginatedFactoryTransferDevices.map((device) => (
                      <Card
                        key={`transfer-${device.id}`}
                        className="cursor-pointer"
                        onClick={() => setSelectedFactoryTransferDevice(device)}
                      >
                        <BatchWorkOrderCardContent
                          batchId={device.batchId}
                          deviceCount={device.deviceCount}
                          customerName={device.customerName}
                          projectName={device.projectName}
                          projectLocation={device.projectLocation}
                          deviceSerials={device.deviceSerials}
                          deviceModels={device.deviceModels}
                          category={device.category}
                          statusNode={(
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                              <ArrowRightLeft className="mr-1 h-3 w-3" />待移交
                            </Badge>
                          )}
                          createdAt={`厂家：${device.supplierName || "未填写"} · 已跟进 ${Math.max(0, Number(device.followUpDays) || 0)} 天`}
                          trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        />
                      </Card>
                    ))}
                  </WorkOrderCardStack>
                  <WorkOrderPagination
                    currentPage={currentPage}
                    totalItems={filteredFactoryTransferDevices.length}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 工单修改申请 */}
        <TabsContent value="corrections" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FilePenLine className="h-5 w-5 text-amber-600" />
                    待审核的工单修改申请
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    申请期间不改变工单状态；打开工单核对差异后，可批准应用或驳回。
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadCorrectionRequests}
                  disabled={correctionsLoading}
                  className="flex shrink-0 items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${correctionsLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {correctionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
              ) : loadErrors.corrections ? (
                <div role="alert" className="py-8 space-y-3 text-center"><p className="text-destructive">{loadErrors.corrections}</p><Button variant="outline" onClick={() => void loadCorrectionRequests()}>重新加载</Button></div>
              ) : correctionRequests.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
                  <p className="text-muted-foreground">暂无待审核的修改申请</p>
                </div>
              ) : (
                <>
                  <WorkOrderCardStack>
                    {paginatedCorrectionRequests.map((request) => (
                      <Card
                        key={`correction-${request.requestId}`}
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedBatchId(request.batchId);
                          setSelectedMode("correction");
                        }}
                      >
                        <CardContent className="grid min-h-24 items-center gap-3 px-5 py-4 md:grid-cols-[180px_1fr_180px_28px]">
                          <div>
                            <p className="font-semibold">{request.batchId}</p>
                            <p className="text-xs text-muted-foreground">申请 #{request.requestId}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm">{request.reason}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {request.requestedByName} · 修改 {request.changes.length} 项
                            </p>
                          </div>
                          <Badge variant="outline" className="w-fit border-amber-300 bg-amber-50 text-amber-800">
                            {request.impact === "warehouse_review"
                              ? "批准后回到仓库确认"
                              : request.impact === "repair_review"
                                ? "批准后回到维修检查"
                                : "批准后不回退流程"}
                          </Badge>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </CardContent>
                      </Card>
                    ))}
                  </WorkOrderCardStack>
                  <WorkOrderPagination
                    currentPage={currentPage}
                    totalItems={correctionRequests.length}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 已完成批次 */}
        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                已完成的批次工单
              </CardTitle>
              <CardDescription>
                以下批次工单已完成全部流程
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
              ) : loadErrors.completed ? (
                <div role="alert" className="py-8 space-y-3 text-center"><p className="text-destructive">{loadErrors.completed}</p><Button variant="outline" onClick={() => void loadCompletedBatches()}>重新加载</Button></div>
              ) : filteredCompletedBatches.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {hasActiveFilters ? "未找到匹配的已完成批次" : "暂无已完成的批次工单"}
                  </p>
                </div>
              ) : (
                <>
                  <WorkOrderCardStack>
                    {paginatedCompletedBatches.map((batch) => {
                    const uniqueKey = `completed-${batch.batchId}`
                    return (
                      <Card key={uniqueKey} className="cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode("view");
                      }}>
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
                            <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800">
                              <CheckCircle2 className="w-3 h-3 mr-1" />已完成
                            </Badge>
                          )}
                          createdAt={`创建时间：${format(toBeijingTime(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}`}
                          trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        />
                      </Card>
                    )
                    })}
                  </WorkOrderCardStack>
                  <WorkOrderPagination
                    currentPage={currentPage}
                    totalItems={filteredCompletedBatches.length}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 全部工单 */}
        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                全部批次工单
              </CardTitle>
              <CardDescription>
                查看所有批次工单，包括待确认、进行中、已完成等所有状态
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
              ) : loadErrors.all ? (
                <div role="alert" className="py-8 space-y-3 text-center"><p className="text-destructive">{loadErrors.all}</p><Button variant="outline" onClick={() => void loadAllBatches()}>重新加载</Button></div>
              ) : filteredAllBatches.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {hasActiveFilters ? "未找到匹配的批次工单" : "暂无批次工单"}
                  </p>
                </div>
              ) : (
                <>
                  <WorkOrderCardStack>
                    {paginatedAllBatches.map((batch) => {
                    const uniqueKey = `all-${batch.batchId}`
                    // 根据状态确定查看模式和Badge
                    const getStatusInfo = (status: string) => {
                      if (status === TicketStatus.CREATED || status === TicketStatus.WAREHOUSE_CONFIRMING) {
                        return { mode: "confirm" as const, badge: "待确认", className: "bg-orange-50 border-orange-300 text-orange-800", icon: Clock }
                      } else if (status === TicketStatus.WAREHOUSE_SHIPPING) {
                        return { mode: "shipping" as const, badge: "待发货", className: "bg-green-50 border-green-300 text-green-800", icon: Truck }
                      } else if (status === TicketStatus.COMPLETED) {
                        return { mode: "view" as const, badge: "已完成", className: "bg-blue-50 border-blue-300 text-blue-800", icon: CheckCircle2 }
                      } else {
                        return { mode: "view" as const, badge: "进行中", className: "bg-purple-50 border-purple-300 text-purple-800", icon: Package }
                      }
                    }
                    const statusInfo = getStatusInfo(batch.status)
                    const StatusIcon = statusInfo.icon
                    
                    return (
                      <Card key={uniqueKey} className="cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode(statusInfo.mode);
                      }}>
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
                            <Badge variant="outline" className={statusInfo.className}>
                              <StatusIcon className="w-3 h-3 mr-1" />{statusInfo.badge}
                            </Badge>
                          )}
                          createdAt={`创建时间：${format(toBeijingTime(batch.createdAt), "MM-dd HH:mm", { locale: zhCN })}`}
                          trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        />
                      </Card>
                    )
                    })}
                  </WorkOrderCardStack>
                  <WorkOrderPagination
                    currentPage={currentPage}
                    totalItems={filteredAllBatches.length}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 数据库管理 */}
        <TabsContent value="database">
          <DatabaseManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
