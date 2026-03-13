"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, RefreshCw, Database, FileSpreadsheet, Loader2, BarChart3, Home, Package, Wrench, LogOut, Download, Trash2, ShieldAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";

interface Statistics {
  deviceNameStats: Array<{ name: string; count: number }>;
  modelNameStats: Array<{ name: string; count: number }>;
  repairStats: Array<{ status: string; count: number }>;
  totalDevices: number;
  totalRepairs: number;
}

export default function DatabaseManager() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Excel 导入
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelImportResult, setExcelImportResult] = useState<{
    success: boolean;
    message: string;
    stats?: any;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Danger Zone 状态 ──
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // 导入进度
  const [importProgress, setImportProgress] = useState({
    stage: '',
    message: '',
    progress: 0,
    total: 0,
    percentage: 0
  });

  // 加载统计信息
  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    setIsLoading(true);
    try {
      // 添加时间戳防止缓存
      const response = await fetch(`/api/statistics?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      });
      if (response.ok) {
        const result = await response.json();
        console.log('[前端] 统计API返回数据:', result);
        if (result.success) {
          console.log('[前端] 物料名称统计:', result.data.deviceNameStats.length, '条');
          console.log('[前端] 规格型号统计:', result.data.modelNameStats.length, '条');
          if (result.data.deviceNameStats.length > 0) {
            console.log('[前端] 前5条物料名称:', result.data.deviceNameStats.slice(0, 5));
          }
          if (result.data.modelNameStats.length > 0) {
            console.log('[前端] 前5条规格型号:', result.data.modelNameStats.slice(0, 5));
          }
          setStatistics(result.data);
        } else {
          console.error('[前端] 统计API返回失败:', result.message);
        }
      } else {
        console.error('[前端] 统计API请求失败:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('[前端] 加载统计信息失败:', error);
    } finally {
      setIsLoading(false);
    }
  };


  // Excel 导入处理（带进度条）
  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert("只支持 .xlsx 或 .xls 格式的 Excel 文件");
      return;
    }

    setIsImportingExcel(true);
    setExcelImportResult(null);
    setImportProgress({ stage: '', message: '准备上传...', progress: 0, total: 0, percentage: 0 });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/excel-stream', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            // 更新进度
            if (data.stage === 'error') {
              setExcelImportResult({
                success: false,
                message: data.message,
              });
              setIsImportingExcel(false);
              return;
            } else if (data.stage === 'complete') {
              setExcelImportResult({
                success: true,
                message: data.message,
                stats: data.stats,
              });
              // 刷新统计信息
              loadStatistics();
              // 清空文件输入
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            } else {
              // 更新进度条
              const percentage = data.percentage || 
                (data.total > 0 ? Math.floor((data.progress / data.total) * 100) : 0);
              
              setImportProgress({
                stage: data.stage || '',
                message: data.message || '',
                progress: data.progress || 0,
                total: data.total || 0,
                percentage
              });
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Excel 导入错误:', error);
      setExcelImportResult({
        success: false,
        message: `导入失败: ${error.message || '网络错误或服务器错误'}`,
      });
    } finally {
      setIsImportingExcel(false);
      setImportProgress({ stage: '', message: '', progress: 0, total: 0, percentage: 0 });
    }
  };

  // 触发文件选择
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // 获取状态中文名称
  const getStatusName = (status: string) => {
    const statusMap: Record<string, string> = {
      'Pending': '待处理',
      'Processing': '处理中',
      'Completed': '已完成',
      'Unrepairable': '无法维修',
      'Delayed': '已延期',
    };
    return statusMap[status] || status;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 bg-gradient-to-br from-background via-background to-primary/5 dark:from-background dark:via-background dark:to-primary/10 min-h-screen">
      <Card className="border-border/50 dark:border-border shadow-lg bg-card dark:bg-card">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text flex items-center gap-3">
                <Database className="h-6 w-6 text-primary" />
                数据库管理
              </CardTitle>
              <CardDescription className="text-base mt-2">
                查看数据库统计信息和导入 Excel 数据
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <Button 
                  onClick={triggerFileSelect} 
                  variant="default" 
                  className="flex items-center gap-2 bg-primary"
                  disabled={isImportingExcel}
                >
                  {isImportingExcel ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      导入中...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      导入 Excel
                    </>
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelImport}
                  className="hidden"
                />
                <Button onClick={loadStatistics} variant="ghost" className="flex items-center gap-2" disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
                <Button 
                  onClick={() => {
                    window.open("/api/tickets/export", "_blank")
                  }}
                  variant="outline" 
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  导出Excel
                </Button>
              </div>
              <div className="flex items-center gap-4 border-l border-border pl-4 ml-4">
                <span className="text-sm text-muted-foreground">
                  {user?.realName} (仓库管理员)
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={logout}
                  className="flex items-center gap-2 text-destructive hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Excel 导入进度条 */}
          {isImportingExcel && (
            <div className="mb-6">
              <Card className="border-2 border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="font-medium">正在导入 Excel 文件</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {importProgress.percentage}%
                      </span>
                    </div>
                    <Progress value={importProgress.percentage} className="h-2" />
                    <div className="text-sm text-muted-foreground">
                      {importProgress.message}
                      {importProgress.total > 0 && (
                        <span className="ml-2">
                          ({importProgress.progress}/{importProgress.total})
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Excel 导入结果提示 */}
          {excelImportResult && !isImportingExcel && (
            <div className="mb-6">
              <Alert variant={excelImportResult.success ? "default" : "destructive"}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="font-medium">{excelImportResult.message}</div>
                    {excelImportResult.success && excelImportResult.stats && (
                      <div className="text-sm mt-2 space-y-1">
                        <div>• 总行数: {excelImportResult.stats.totalRows}</div>
                        <div>• 有效记录: {excelImportResult.stats.validRecords}</div>
                        <div>• 跳过行数: {excelImportResult.stats.skippedRows}</div>
                        <div>• 新增规格型号: {excelImportResult.stats.modelsAdded}</div>
                        <div>• 已存在规格型号: {excelImportResult.stats.modelsSkipped}</div>
                        <div>• 处理设备数: {excelImportResult.stats.devicesProcessed}</div>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : statistics ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="overview" className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  概览
                </TabsTrigger>
                <TabsTrigger value="devices" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  物料统计
                </TabsTrigger>
                <TabsTrigger value="models" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  型号统计
                </TabsTrigger>
                <TabsTrigger value="repairs" className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  工单统计
                </TabsTrigger>
              </TabsList>

              {/* 概览标签页 */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        总设备数
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-primary">{statistics.totalDevices.toLocaleString()}</div>
                      <p className="text-sm text-muted-foreground mt-2">设备库存总数</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        总工单数
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-primary">{statistics.totalRepairs.toLocaleString()}</div>
                      <p className="text-sm text-muted-foreground mt-2">维修工单总数</p>
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">快速统计</CardTitle>
                    <CardDescription>各统计模块的数据概览</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-primary">{statistics.deviceNameStats.length}</div>
                        <p className="text-sm text-muted-foreground mt-1">物料种类</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-primary">{statistics.modelNameStats.length}</div>
                        <p className="text-sm text-muted-foreground mt-1">规格型号种类</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-primary">{statistics.repairStats.length}</div>
                        <p className="text-sm text-muted-foreground mt-1">工单状态类型</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 物料名称统计标签页 */}
              <TabsContent value="devices" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      物料名称统计
                    </CardTitle>
                    <CardDescription>按物料名称（DeviceName）分组统计设备数量</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">排名</TableHead>
                            <TableHead>物料名称</TableHead>
                            <TableHead className="text-right">数量</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statistics.deviceNameStats.length > 0 ? (
                            statistics.deviceNameStats.map((item, index) => (
                              <TableRow key={item.name}>
                                <TableCell className="font-medium">{index + 1}</TableCell>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="text-right font-medium">{item.count.toLocaleString()}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                暂无数据
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                      共 {statistics.deviceNameStats.length} 种物料
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 规格型号统计标签页 */}
              <TabsContent value="models" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      规格型号统计
                    </CardTitle>
                    <CardDescription>按规格型号（ModelName）分组统计设备数量</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">排名</TableHead>
                            <TableHead>规格型号</TableHead>
                            <TableHead className="text-right">数量</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statistics.modelNameStats.length > 0 ? (
                            statistics.modelNameStats.map((item, index) => (
                              <TableRow key={item.name}>
                                <TableCell className="font-medium">{index + 1}</TableCell>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="text-right font-medium">{item.count.toLocaleString()}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                暂无数据
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                      共 {statistics.modelNameStats.length} 种规格型号
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 维修工单统计标签页 */}
              <TabsContent value="repairs" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      维修工单统计
                    </CardTitle>
                    <CardDescription>按工单状态分组统计</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>状态</TableHead>
                            <TableHead className="text-right">数量</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statistics.repairStats.length > 0 ? (
                            statistics.repairStats.map((item) => (
                              <TableRow key={item.status}>
                                <TableCell>{getStatusName(item.status)}</TableCell>
                                <TableCell className="text-right font-medium">{item.count.toLocaleString()}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                                暂无数据
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>无法加载统计信息</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════ Danger Zone ══════════════════ */}
      <Card className="border-2 border-destructive/50 bg-destructive/5 dark:bg-destructive/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive text-base">
            <ShieldAlert className="h-5 w-5" />
            危险操作区（Danger Zone）
          </CardTitle>
          <CardDescription className="text-destructive/70 text-xs">
            以下操作具有<strong>不可逆</strong>的破坏性，请在测试环境谨慎执行。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-background px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">清空所有维修工单</p>
              <p className="text-xs text-muted-foreground">
                删除全部工单主表及历史流水；用户、设备、批次数据安全保留。
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={isClearing}
              onClick={() => setShowClearDialog(true)}
              className="ml-6 shrink-0"
            >
              {isClearing ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  清空中...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  清空所有维修工单
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 二次确认 AlertDialog ── */}
      <AlertDialog open={showClearDialog} onOpenChange={(open) => { if (!isClearing) setShowClearDialog(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              警告：确定要清空所有数据吗？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  此操作将<strong className="text-destructive">永久删除所有维修工单及其历史流水！</strong>
                </p>
                <p className="text-muted-foreground">
                  但仓库设备、入库批次及用户数据将安全保留。是否继续？
                </p>
                <p className="font-semibold text-destructive">⚠️ 该操作执行后无法恢复！</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
              onClick={async (e) => {
                e.preventDefault(); // 阻止弹窗在请求完成前自动关闭
                setIsClearing(true);
                try {
                  const res = await fetch("/api/admin/clear-tickets", { method: "DELETE" });
                  const data: {
                    success: boolean;
                    message: string;
                    deletedCount?: { tickets: number; history: number };
                  } = await res.json();

                  setShowClearDialog(false);

                  if (data.success) {
                    toast({
                      title: "✅ 清空完成",
                      description: `已删除 ${data.deletedCount?.tickets ?? 0} 条工单，${data.deletedCount?.history ?? 0} 条历史流水`,
                    });
                    setTimeout(() => window.location.reload(), 1200);
                  } else {
                    toast({
                      title: "❌ 清空失败",
                      description: data.message || "操作失败，请联系技术支持",
                      variant: "destructive",
                    });
                  }
                } catch (err: any) {
                  setShowClearDialog(false);
                  toast({
                    title: "❌ 网络错误",
                    description: err.message || "请求失败，请检查服务状态",
                    variant: "destructive",
                  });
                } finally {
                  setIsClearing(false);
                }
              }}
            >
              {isClearing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />清空中...</>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
