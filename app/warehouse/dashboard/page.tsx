"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, CheckCircle, Clock, Loader2, AlertCircle, ChevronRight, Database, Truck, Download, CheckCircle2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import DatabaseManager from "@/components/admin/database-manager";
import WarehouseBatchConfirm from "@/components/warehouse-batch-confirm";
import WarehouseBatchShipping from "@/components/warehouse-batch-shipping";
import { TicketStatus } from "@/lib/enums";

interface PendingBatch {
  batchId: string;
  projectName: string;
  projectLocation: string;
  deviceCount: number;
  category: string;
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

  useEffect(() => {
    if (activeTab === "pending") {
      loadPendingBatches();
    } else if (activeTab === "shipping") {
      loadShippingBatches();
    } else if (activeTab === "completed") {
      loadCompletedBatches();
    } else if (activeTab === "all") {
      loadAllBatches();
    }
  }, [activeTab]);

  const loadPendingBatches = async () => {
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
  };

  const loadShippingBatches = async () => {
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
  };

  const loadCompletedBatches = async () => {
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
  };

  const loadAllBatches = async () => {
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
  };

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
              ) : pendingBatches.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-muted-foreground">暂无待确认的批次工单</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingBatches.map((batch, index) => {
                    // 调试：打印batch信息
                    if (index === 0) {
                      console.log('[Warehouse Dashboard] 第一个批次数据:', batch)
                    }
                    // 生成唯一key：使用时间戳确保绝对唯一
                    const uniqueKey = `pending-${batch.batchId}-${batch.createdAt}-${index}`
                    
                    return (
                      <Card key={uniqueKey} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode("confirm");
                      }}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">{batch.batchId}</h3>
                                <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-800">
                                  <Clock className="w-3 h-3 mr-1" />
                                  待确认
                                </Badge>
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
                    )
                  })}
                </div>
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
              ) : shippingBatches.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-muted-foreground">暂无待发货的批次工单</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shippingBatches.map((batch, index) => {
                    const uniqueKey = `shipping-${batch.batchId}-${batch.createdAt}-${index}`
                    const isRmaBatch = batch.status === TicketStatus.PENDING_FACTORY
                      || batch.status === "pending_factory"
                    return (
                      <Card key={uniqueKey} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode("shipping");
                      }}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">{batch.batchId}</h3>
                                {isRmaBatch ? (
                                  <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800">
                                    <Truck className="w-3 h-3 mr-1" />
                                    返厂处理
                                  </Badge>
                                ) : (
                                <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800">
                                  <Truck className="w-3 h-3 mr-1" />
                                  待发货
                                </Badge>
                                )}
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
                    )
                  })}
                </div>
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
              ) : completedBatches.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">暂无已完成的批次工单</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedBatches.map((batch, index) => {
                    const uniqueKey = `completed-${batch.batchId}-${batch.createdAt}-${index}`
                    return (
                      <Card key={uniqueKey} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode("view");
                      }}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">{batch.batchId}</h3>
                                <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  已完成
                                </Badge>
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
                    )
                  })}
                </div>
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
              ) : allBatches.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">暂无批次工单</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allBatches.map((batch, index) => {
                    const uniqueKey = `all-${batch.batchId}-${batch.createdAt}-${index}`
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
                      <Card key={uniqueKey} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => {
                        setSelectedBatchId(batch.batchId);
                        setSelectedMode(statusInfo.mode);
                      }}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">{batch.batchId}</h3>
                                <Badge variant="outline" className={statusInfo.className}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {statusInfo.badge}
                                </Badge>
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
                    )
                  })}
                </div>
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
