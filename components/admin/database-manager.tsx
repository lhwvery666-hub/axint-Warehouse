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
import { AlertCircle, RefreshCw, Database, FileSpreadsheet, Loader2, BarChart3, Home, Package, Wrench, LogOut, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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


  // Excel 导入处理
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

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/excel', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setExcelImportResult({
          success: true,
          message: result.message,
          stats: result.stats,
        });
        // 刷新统计信息
        loadStatistics();
        // 清空文件输入
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setExcelImportResult({
          success: false,
          message: result.message || result.error || '导入失败',
        });
      }
    } catch (error: any) {
      console.error('Excel 导入错误:', error);
      setExcelImportResult({
        success: false,
        message: `导入失败: ${error.message || '网络错误或服务器错误'}`,
      });
    } finally {
      setIsImportingExcel(false);
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
          {/* Excel 导入结果提示 */}
          {excelImportResult && (
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
    </div>
  );
}
