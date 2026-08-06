"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, CheckCircle, Clock, Loader2, AlertCircle, ChevronRight, Database, Truck, Download, CheckCircle2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toBeijingTime } from "@/lib/utils";
import DatabaseManager from "@/components/admin/database-manager";
import WarehouseBatchConfirm from "@/components/warehouse-batch-confirm";
import WarehouseBatchShipping from "@/components/warehouse-batch-shipping";
import { BatchWorkOrderCardContent } from "@/components/batch-work-order-card-content";
import { WorkOrderCardStack } from "@/components/work-order-card-stack";
import { TicketStatus } from "@/lib/enums";
import { WorkOrderFilterBar } from "@/components/work-order-filter-bar";
import { WorkOrderPagination } from "@/components/work-order-pagination";
import { ALL_REPAIR_STATUS_FILTER, matchesRepairListFilters, REPAIR_STATUS_FILTER_OPTIONS } from "@/lib/repair-list-filters";
import { clampPage, paginateItems } from "@/lib/pagination";

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
  createdAt: string;
  status: string;
}

export default function WarehouseDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([]);
  const [shippingBatches, setShippingBatches] = useState<PendingBatch[]>([]);
  const [completedBatches, setCompletedBatches] = useState<PendingBatch[]>([]);
  const [allBatches, setAllBatches] = useState<PendingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<"confirm" | "shipping" | "view">("confirm");
  const [workOrderQuery, setWorkOrderQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_REPAIR_STATUS_FILTER);
  const [currentPage, setCurrentPage] = useState(1);

  const loadPendingBatches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tickets/warehouse-pending-batches");
      const result = await response.json();
      
      if (result.success) {
        setPendingBatches(result.data || []);
      }
    } catch (error) {
      console.error("加载待确认批次失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShippingBatches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tickets/warehouse-shipping-batches");
      const result = await response.json();
      
      if (result.success) {
        setShippingBatches(result.data || []);
      }
    } catch (error) {
      console.error("加载待发货批次失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCompletedBatches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tickets/warehouse-completed-batches");
      const result = await response.json();
      
      if (result.success) {
        setCompletedBatches(result.data || []);
      }
    } catch (error) {
      console.error("加载已完成批次失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllBatches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tickets/all-batches");
      const result = await response.json();
      
      if (result.success) {
        setAllBatches(result.data || []);
      }
    } catch (error) {
      console.error("加载全部批次失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "pending") {
      void loadPendingBatches();
    } else if (activeTab === "shipping") {
      void loadShippingBatches();
    } else if (activeTab === "completed") {
      void loadCompletedBatches();
    } else if (activeTab === "all") {
      void loadAllBatches();
    }
  }, [activeTab, loadAllBatches, loadCompletedBatches, loadPendingBatches, loadShippingBatches]);

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
  const filteredCompletedBatches = filterWarehouseBatches(completedBatches);
  const filteredAllBatches = filterWarehouseBatches(allBatches);
  const activeFilteredCount = activeTab === "pending"
    ? filteredPendingBatches.length
    : activeTab === "shipping"
      ? filteredShippingBatches.length
      : activeTab === "completed"
        ? filteredCompletedBatches.length
        : activeTab === "all"
          ? filteredAllBatches.length
          : 0;
  const paginatedPendingBatches = paginateItems(filteredPendingBatches, currentPage);
  const paginatedShippingBatches = paginateItems(filteredShippingBatches, currentPage);
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
  if (selectedBatchId) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        {selectedMode === "confirm" ? (
          <WarehouseBatchConfirm
            batchId={selectedBatchId}
            onBack={() => {
              setSelectedBatchId(null);
              loadPendingBatches();
            }}
            onConfirmed={() => {
              setSelectedBatchId(null);
              loadPendingBatches();
            }}
          />
        ) : selectedMode === "shipping" ? (
          <WarehouseBatchShipping
            batchId={selectedBatchId}
            onBack={() => {
              setSelectedBatchId(null);
              loadShippingBatches();
            }}
            onCompleted={() => {
              setSelectedBatchId(null);
              loadShippingBatches();
            }}
          />
        ) : (
          // 查看已完成批次详情（允许修改发货信息）
          <WarehouseBatchShipping
            batchId={selectedBatchId}
            onBack={() => {
              setSelectedBatchId(null);
              loadCompletedBatches();
            }}
            onCompleted={() => {
              setSelectedBatchId(null);
              loadCompletedBatches();
            }}
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
        <TabsList className="grid w-full md:w-auto grid-cols-5 md:grid-cols-5">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            待确认批次
          </TabsTrigger>
          <TabsTrigger value="shipping" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            待发货批次
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
                以下批次工单待仓库安排发货（含返厂维修寄送原厂）
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
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
                    const isRmaBatch = batch.status === TicketStatus.PENDING_FACTORY
                      || batch.status === "pending_factory"
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
                          statusNode={isRmaBatch ? (
                            <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800">
                              <Truck className="w-3 h-3 mr-1" />返厂处理
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800">
                              <Truck className="w-3 h-3 mr-1" />待发货
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
