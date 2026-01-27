"use client"

import { ChevronRight, Clock, Wrench, AlertCircle, CheckCircle, Search, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { useRepairContext } from "@/context/RepairContext"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { format, isAfter, isBefore, parseISO, subDays, subMonths } from "date-fns"
import { cn } from "@/lib/utils"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@/context/auth-context"
import { getPendingStatusesForRole, shouldShowToRole, calculateProgress, getCurrentStep } from "@/lib/workflow-utils"
import WorkflowProgress from "@/components/workflow-progress"

interface DashboardProps {
  onStartRepair: (taskId: string) => void
}

export default function Dashboard({ onStartRepair }: DashboardProps) {
  // 从RepairContext获取维修工单数据
  const { repairs, loading } = useRepairContext();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 将工单数据转换为组件需要的格式
  const [tasks, setTasks] = useState<any[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<any[]>([]);
  
  // 从 URL 参数恢复搜索状态
  const [searchQuery, setSearchQuery] = useState(() => {
    return searchParams.get("q") || "";
  });
  
  // 时间筛选状态 - 从 URL 参数恢复
  const [filterTimeRange, setFilterTimeRange] = useState<string>(() => {
    return searchParams.get("time") || "all";
  });
  
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>(() => {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    return {
      from: fromParam ? parseISO(fromParam) : undefined,
      to: toParam ? parseISO(toParam) : undefined
    };
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  // 弹窗状态
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  
  useEffect(() => {
    // 空状态保护：如果 repairs 为空或未定义，设置为空数组
    if (!repairs || repairs.length === 0) {
      setTasks([]);
      return;
    }
    
    // 根据用户角色过滤工单：只显示该角色需要处理的工单
    const userRole = user?.role || "technician";
    const pendingStatuses = getPendingStatusesForRole(userRole);
    
    const activeTasks = repairs
      .filter(repair => {
        if (!repair) return false;
        
        const status = (repair.status || "").toString();
        
        // 排除终止状态（Cancelled 永远不显示在待办列表）
        if (status === "Cancelled" || status === "cancelled") {
          return false;
        }
        
        // 根据角色过滤
        if (userRole === "technician") {
          // 维修人员：显示 Created 和 In_Repair 状态的工单
          return status === "Created" || status === "created" || 
                 status === "In_Repair" || status === "in_repair" ||
                 status === "Processing" || status === "processing" ||
                 status === "Delayed" || status === "delayed";
        } else if (userRole === "admin" || userRole === "business") {
          // 管理员/商务：显示 Admin_Review 状态的工单
          return status === "Admin_Review" || status === "admin_review";
        } else if (userRole === "warehouse") {
          // 仓库管理员：显示 Pending_Shipment 和 Return_Unrepaired 状态的工单
          return status === "Pending_Shipment" || status === "pending_shipment" ||
                 status === "Return_Unrepaired" || status === "return_unrepaired";
        }
        return false;
      })
      .map(repair => {
        const progress = calculateProgress(repair, getCurrentStep(repair.status || "Created"));
        return {
          id: repair.id || "",
          deviceName: repair.deviceName || repair.deviceModel || "未知设备",
          location: repair.location || "未知位置",
          fault: repair.problem || "无故障描述",
          status: (repair.status || "created") as string,
          priority: repair.priority || "medium",
          reportedAt: repair.reportedAt ? (repair.reportedAt.split(" ")[1] || repair.reportedAt) : "",
          reportedAtFull: repair.reportedAt || "",
          deviceModel: repair.deviceModel || "",
          deviceSerialNumber: repair.deviceSerialNumber || "",
          productSN: repair.productSN || repair.deviceSerialNumber || "",
          expectedCompletionDate: repair.expectedCompletionDate,
          progress: progress.completionRate,
          canProceed: progress.canProceed,
          rawData: repair, // 保存原始数据用于进度显示
        };
      });
    
    setTasks(activeTasks);
  }, [repairs, user]);
  
  // 根据时间范围过滤任务
  const filterTasksByTimeRange = (task: any) => {
    if (filterTimeRange === "all") return true;
    
    const fullReportDate = task.reportedAtFull || task.reportedAt;
    if (!fullReportDate) return true;
    
    let taskDate: Date;
    try {
      if (fullReportDate.includes(" ")) {
        taskDate = parseISO(fullReportDate.split(" ")[0]);
      } else {
        taskDate = parseISO(fullReportDate);
      }
    } catch {
      return true;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    taskDate.setHours(0, 0, 0, 0);
    
    switch (filterTimeRange) {
      case "today":
        return taskDate.toDateString() === today.toDateString();
      case "week":
        return isAfter(taskDate, subDays(today, 7)) || taskDate.toDateString() === subDays(today, 7).toDateString();
      case "month":
        return isAfter(taskDate, subMonths(today, 1)) || taskDate.toDateString() === subMonths(today, 1).toDateString();
      case "custom":
        if (!dateRange.from) return true;
        if (dateRange.from && !dateRange.to) {
          return isAfter(taskDate, dateRange.from) || taskDate.toDateString() === dateRange.from.toDateString();
        }
        return (isAfter(taskDate, dateRange.from) || taskDate.toDateString() === dateRange.from.toDateString()) && 
               (isBefore(taskDate, dateRange.to || new Date()) || taskDate.toDateString() === (dateRange.to || new Date()).toDateString());
      default:
        return true;
    }
  };
  
  // 更新 URL 参数以保存搜索状态（使用防抖，避免频繁更新 URL）
  useEffect(() => {
    // 延迟更新 URL，避免在初始化时立即更新
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      
      if (filterTimeRange !== "all") {
        params.set("time", filterTimeRange);
      }
      
      if (filterTimeRange === "custom") {
        if (dateRange.from) {
          params.set("from", format(dateRange.from, "yyyy-MM-dd"));
        }
        if (dateRange.to) {
          params.set("to", format(dateRange.to, "yyyy-MM-dd"));
        }
      }
      
      // 使用 replace 而不是 push，避免产生过多历史记录
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      const currentUrl = window.location.pathname + window.location.search;
      
      // 只有当 URL 确实需要更新时才更新，避免不必要的导航
      if (newUrl !== currentUrl) {
        router.replace(newUrl, { scroll: false });
      }
    }, 300); // 300ms 防抖
    
    return () => clearTimeout(timer);
  }, [searchQuery, filterTimeRange, dateRange, router]);

  // 搜索和时间过滤
  useEffect(() => {
    let filtered = Array.isArray(tasks) ? tasks : [];
    
    filtered = filtered.filter(filterTasksByTimeRange);
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(task => 
        (task?.deviceName || "").toLowerCase().includes(query) ||
        (task?.location || "").toLowerCase().includes(query) ||
        (task?.fault || "").toLowerCase().includes(query) ||
        (task?.deviceModel || "").toLowerCase().includes(query) ||
        (task?.deviceSerialNumber || "").toLowerCase().includes(query)
      );
    }
    
    setFilteredTasks(filtered);
  }, [searchQuery, filterTimeRange, dateRange, tasks]);
  
  const getStatusBadge = (status: string) => {
    // 兼容新旧状态
    const normalizedStatus = status === "pending" ? "created" : 
                            status === "processing" ? "in_repair" : 
                            status
    
    if (normalizedStatus === "created" || status === "pending") {
      return (
        <Badge className="bg-warning/15 text-warning-foreground border-warning/30 hover:bg-warning/20">
          <Clock className="w-3 h-3 mr-1" />
          待处理
        </Badge>
      )
    } else if (normalizedStatus === "in_repair" || status === "processing") {
      return (
        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
          <Wrench className="w-3 h-3 mr-1" />
          维修中
        </Badge>
      )
    } else if (normalizedStatus === "admin_review") {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          待商务处理
        </Badge>
      )
    } else if (normalizedStatus === "pending_shipment") {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          待发货
        </Badge>
      )
    } else if (normalizedStatus === "completed") {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          已完成
        </Badge>
      )
    } else if (normalizedStatus === "unrepairable") {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          无法维修
        </Badge>
      )
    } else if (normalizedStatus === "delayed") {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 text-xs">
          <Clock className="w-3 h-3 mr-1" />
          已延期
        </Badge>
      )
    } else {
      return null;
    }
  }

  const getPriorityIndicator = (priority: "high" | "medium" | "low") => {
    const colors = {
      high: "bg-destructive",
      medium: "bg-warning",
      low: "bg-success",
    }
    return <span className={`w-2 h-2 rounded-full ${colors[priority]}`} />
  }

  // 如果正在加载，显示加载状态
  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 始终渲染完整仪表盘布局（即使当前没有数据，也保持美观一致）
  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-background via-background to-primary/5 dark:from-background dark:via-background dark:to-primary/10 min-h-screen">
      {/* 维修工单详情弹窗 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">维修工单详情</DialogTitle>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b">
                <h3 className="font-semibold text-lg">{selectedTask.deviceName}</h3>
                {getStatusBadge(selectedTask.status)}
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">位置</p>
                  <p className="font-medium">{selectedTask.location}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">报修时间</p>
                  <p className="font-medium">{selectedTask.reportedAt}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium">故障描述</p>
                <Card className="bg-muted/50 border-border/50">
                  <CardContent className="p-4 text-sm leading-relaxed">
                    {selectedTask.fault}
                  </CardContent>
                </Card>
              </div>
              
              <DialogFooter className="flex sm:justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1">
                  关闭
                </Button>
                <Button onClick={() => {
                  setIsDialogOpen(false);
                  onStartRepair(selectedTask.id);
                }} className="flex-1">
                  查看详情
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Header */}
      <div className="flex items-center justify-between pt-2 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">维修服务仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-1">欢迎回来，维修工程师</p>
        </div>
        <div className="md:hidden w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
          <span className="text-primary-foreground font-semibold text-sm">JD</span>
        </div>
      </div>

      {/* Search Bar and Time Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="搜索待维修和维修中的工单（设备名称、位置、故障描述等）..."
            className="pl-10 h-12 text-base shadow-md border-border/50 dark:border-border focus:border-primary/50 dark:focus:border-primary/40 bg-background dark:bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterTimeRange} onValueChange={setFilterTimeRange}>
            <SelectTrigger className="w-[140px] md:w-[160px] h-12 shadow-md border-border/50 dark:border-border bg-background dark:bg-background">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="时间范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部时间</SelectItem>
              <SelectItem value="today">今天</SelectItem>
              <SelectItem value="week">最近7天</SelectItem>
              <SelectItem value="month">最近30天</SelectItem>
              <SelectItem value="custom">自定义时间</SelectItem>
            </SelectContent>
          </Select>
          
          {filterTimeRange === "custom" && (
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] md:w-[200px] h-12 justify-start text-left font-normal shadow-md border-border/50 dark:border-border bg-background dark:bg-background",
                    !dateRange.from && !dateRange.to && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "yyyy-MM-dd")} 至 {format(dateRange.to, "yyyy-MM-dd")}
                      </>
                    ) : (
                      format(dateRange.from, "yyyy-MM-dd")
                    )
                  ) : (
                    "选择日期范围"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  selected={{
                    from: dateRange.from,
                    to: dateRange.to,
                  }}
                  onSelect={(range) => {
                    setDateRange({
                      from: range?.from,
                      to: range?.to
                    });
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 md:gap-6">
        <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/20 dark:to-primary/15 bg-card dark:bg-card">
          <CardContent className="p-4 md:p-6 text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="h-5 w-5 text-primary mr-2" />
              <p className="text-3xl md:text-4xl font-bold text-primary">
                {repairs.filter(r => r && (r.status === "pending" || r.status === "created")).length}
              </p>
            </div>
            <p className="text-sm font-medium text-muted-foreground">待处理</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-warning/5 to-warning/10 dark:from-warning/20 dark:to-warning/15 bg-card dark:bg-card">
          <CardContent className="p-4 md:p-6 text-center">
            <div className="flex items-center justify-center mb-2">
              <Wrench className="h-5 w-5 text-warning mr-2" />
              <p className="text-3xl md:text-4xl font-bold text-warning">
                {repairs.filter(r => r && (r.status === "processing" || r.status === "in_repair" || r.status === "delayed")).length}
              </p>
            </div>
            <p className="text-sm font-medium text-muted-foreground">进行中（含已延期）</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Task List Header */}
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-lg md:text-xl font-bold text-foreground">维修工单</h2>
            <Button variant="ghost" size="sm" className="text-primary text-sm h-9 hover:bg-primary/10" onClick={() => onStartRepair("all")}>
              查看全部 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          {/* Task List */}
          <div className="grid gap-4 md:grid-cols-2">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <Card
                  key={task.id}
                  className="border-border/50 dark:border-border hover:border-primary/50 dark:hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer active:scale-[0.98] bg-card/50 dark:bg-card backdrop-blur-sm"
                  onClick={() => onStartRepair(task.id)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getPriorityIndicator(task.priority)}
                          <h3 className="font-semibold text-foreground truncate text-base">{task.deviceName}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 truncate flex items-center gap-1">
                          <span className="text-xs">📍</span>
                          {task.location}
                        </p>
                        <div className="flex items-start gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2">
                          <AlertCircle className="w-4 h-4 text-muted-foreground dark:text-muted-foreground mt-0.5 shrink-0" />
                          <span className="text-muted-foreground dark:text-muted-foreground line-clamp-2">{task.fault}</span>
                        </div>
                        {/* 工作流进度 */}
                        {task.rawData && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">填写进度</span>
                              <span className="text-xs font-medium text-primary">{task.progress || 0}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div 
                                className="bg-primary h-1.5 rounded-full transition-all"
                                style={{ width: `${task.progress || 0}%` }}
                              />
                            </div>
                            {task.canProceed && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                可流转到下一步
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {getStatusBadge(task.status)}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{task.reportedAt}</span>
                        {task.status === "delayed" && task.expectedCompletionDate && (
                          <span className="text-[11px] text-amber-400 whitespace-nowrap">
                            延期至 {format(new Date(task.expectedCompletionDate), "MM-dd")}
                          </span>
                        )}
                        {/* 待补录 SN 提示 */}
                        {(() => {
                          const needsSupplement = !task.productSN || 
                            task.productSN.trim() === "" || 
                            task.productSN.toUpperCase() === "PENDING" ||
                            task.deviceSerialNumber?.toUpperCase() === "PENDING"
                          return needsSupplement ? (
                            <span className="text-[11px] text-warning whitespace-nowrap">
                              待补录 SN
                            </span>
                          ) : null
                        })()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="md:col-span-2 border-dashed border-border/50 bg-muted/20">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    {(searchQuery || filterTimeRange !== "all") ? "未找到匹配的工单" : "暂无待办维修任务"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(searchQuery || filterTimeRange !== "all") ? "请尝试其他搜索关键词或调整时间范围" : "请先添加设备和维修数据"}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Recent Activity */}
          <Card className="border-border/50 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">近期活动</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {repairs && repairs.length > 0 ? (
                  repairs
                    .filter(repair => repair && repair.reportedAt)
                    .sort((a, b) => {
                      try {
                        return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
                      } catch {
                        return 0
                      }
                    })
                    .slice(0, 3)
                    .map((repair, index) => (
                      <div key={repair.id || index} className="flex items-start gap-3 text-sm p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                          repair.status === "completed" ? "bg-success" : 
                          repair.status === "processing" ? "bg-primary" : 
                          repair.status === "pending" ? "bg-warning" : "bg-muted-foreground"
                        }`}></div>
                      <p className="text-muted-foreground leading-relaxed">{
                          repair.status === "completed" ? `完成 ${repair.deviceName || repair.deviceModel || '设备'} 的维修` :
                          repair.status === "processing" ? `正在处理 ${repair.deviceName || repair.deviceModel || '设备'}` :
                          `新工单: ${repair.deviceName || repair.deviceModel || '设备'}`
                        }</p>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">暂无近期活动</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
