"use client"

import { ChevronRight, Clock, Wrench, AlertCircle, CheckCircle, Search, Calendar, FileText, Printer } from "lucide-react"
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
import { getPendingStatusesForRole, calculateProgress, getCurrentStep } from "@/lib/workflow-utils"
import { TicketStatus, UserRole, normalizeTicketStatus, isTerminalStatus } from "@/lib/enums"
import WorkflowProgress from "@/components/workflow-progress"

interface DashboardProps {
  onStartRepair: (taskId: string, batchContext?: { batchId: string; devices: any[] }) => void
}

/** 计算某批次的未读消息数（与 localStorage 存储的已读数对比） */
function getUnreadCount(batchId: string, totalCount: number): number {
  if (typeof window === 'undefined' || !batchId) return 0;
  const seen = parseInt(localStorage.getItem(`chat_seen_${batchId}`) || '0', 10);
  return Math.max(0, totalCount - seen);
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
  
  // 批次设备选择弹窗状态
  // 注释掉设备选择对话框，现在直接跳转到批次详情页
  // const [isBatchDeviceDialogOpen, setIsBatchDeviceDialogOpen] = useState(false);
  // const [selectedBatchTask, setSelectedBatchTask] = useState<any>(null);
  
  useEffect(() => {
    // 空状态保护：如果 repairs 为空或未定义，设置为空数组
    if (!repairs || repairs.length === 0) {
      setTasks([]);
      return;
    }
    
    console.log('🏠 Dashboard - 从RepairContext获取的repairs数量:', repairs.length)
    console.log('🏠 Dashboard - 前3个repairs样本:', repairs.slice(0, 3))
    
    // 根据用户角色过滤工单：只显示该角色需要处理的工单
    const userRole = (user?.role || UserRole.TECHNICIAN) as UserRole;
    const pendingStatuses = getPendingStatusesForRole(userRole);
    
    const activeTasks = repairs
      .filter(repair => {
        if (!repair) return false;

        const normalizedStatus = normalizeTicketStatus(repair.status || null);
        if (!normalizedStatus) return false;

        // 排除终止状态（Cancelled / Completed / Scrapped 等）
        if (isTerminalStatus(normalizedStatus)) {
          return false;
        }

        // 根据角色过滤：利用 workflow-utils 中的待处理状态定义
        return pendingStatuses.includes(normalizedStatus);
      })
      .map(repair => {
        const currentStatus = normalizeTicketStatus(repair.status || null) || TicketStatus.CREATED;
        const progress = calculateProgress(repair, getCurrentStep(currentStatus));
        return {
          id: repair.id || "",
          workOrderNumber: (repair as any).workOrderNumber || "",
          deviceName: repair.deviceName || repair.deviceModel || "未知设备",
          location: repair.location || "未知位置",
          fault: repair.problem || "无故障描述",
          status: currentStatus,
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
          batchId: (repair as any).batchId || null, // 批次ID
          projectName: (repair as any).projectName || repair.projectLocation || "",
          contactInfo: (repair as any).contactInfo || "",
        };
      });
    
    // 🔧 批次分组逻辑：将同一batchId的工单合并为一个批次任务
    console.log('🔧 Dashboard - 开始批次分组，activeTasks数量:', activeTasks.length)
    console.log('🔧 Dashboard - activeTasks样本:', activeTasks.slice(0, 3).map(t => ({ id: t.id, batchId: t.batchId, deviceSN: t.deviceSerialNumber })))
    
    const batchMap = new Map<string, any>();
    const individualTasks: any[] = [];
    
    activeTasks.forEach((task, idx) => {
      console.log(`🔍 Dashboard - Task ${idx}: batchId=${task.batchId}, deviceSN=${task.deviceSerialNumber}`)
      if (task.batchId && task.batchId.trim() !== "") {
        if (batchMap.has(task.batchId)) {
          // 已有该批次，添加设备到devices数组
          const batchTask = batchMap.get(task.batchId);
          batchTask.devices.push(task);
          batchTask.deviceCount = batchTask.devices.length;
        } else {
          // 新批次，创建批次任务对象
          batchMap.set(task.batchId, {
            id: task.batchId,
            isBatch: true,
            batchId: task.batchId,
            projectName: task.projectName || "未知项目",
            contactInfo: task.contactInfo || "无联系信息",
            deviceCount: 1,
            status: task.status,
            priority: task.priority,
            reportedAt: task.reportedAt,
            reportedAtFull: task.reportedAtFull,
            devices: [task], // 该批次包含的所有设备
            progress: task.progress,
            canProceed: task.canProceed,
            rawData: task.rawData, // 保存原始数据用于显示消息数和签字照片
          });
        }
      } else {
        // 没有batchId，作为单独工单处理
        individualTasks.push(task);
      }
    });
    
    // 合并批次任务和单独任务
    const groupedTasks = [...Array.from(batchMap.values()), ...individualTasks];
    
    setTasks(groupedTasks);
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
      filtered = filtered.filter(task => {
        // 对于批次工单，搜索批次号、项目名称、联系信息，以及所有设备的序列号
        if (task.isBatch) {
          const batchMatches = (task.batchId || "").toLowerCase().includes(query) ||
                               (task.projectName || "").toLowerCase().includes(query) ||
                               (task.contactInfo || "").toLowerCase().includes(query);
          const devicesMatch = task.devices && task.devices.some((device: any) => 
            (device.deviceSerialNumber || "").toLowerCase().includes(query) ||
            (device.fault || "").toLowerCase().includes(query)
          );
          return batchMatches || devicesMatch;
        }
        // 对于单独工单，搜索工单号、序列号、故障描述
        return ((task as any).workOrderNumber || "").toLowerCase().includes(query) ||
        (task?.deviceSerialNumber || "").toLowerCase().includes(query) ||
               (task?.fault || "").toLowerCase().includes(query);
      });
    }
    
    setFilteredTasks(filtered);
  }, [searchQuery, filterTimeRange, dateRange, tasks]);
  
  const getStatusBadge = (status: TicketStatus) => {
    const normalized = status
    if (normalized === TicketStatus.CREATED || normalized === TicketStatus.PENDING) {
      return (
        <Badge className="bg-warning/15 text-warning-foreground border-warning/30 hover:bg-warning/20">
          <Clock className="w-3 h-3 mr-1" />
          待处理
        </Badge>
      )
    } else if (normalized === TicketStatus.IN_REPAIR || normalized === TicketStatus.PROCESSING) {
      return (
        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
          <Wrench className="w-3 h-3 mr-1" />
          维修中
        </Badge>
      )
    } else if (normalized === TicketStatus.PENDING_REPORTER_CONFIRM) {
      return (
        <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          待现场确认
        </Badge>
      )
    } else if (normalized === TicketStatus.ADMIN_REVIEW) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          待商务处理
        </Badge>
      )
    } else if (normalized === TicketStatus.PENDING_SHIPMENT) {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          待发货
        </Badge>
      )
    } else if (normalized === TicketStatus.COMPLETED) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          已完成
        </Badge>
      )
    } else if (normalized === TicketStatus.UNREPAIRABLE) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          无法维修
        </Badge>
      )
    } else if (normalized === TicketStatus.DELAYED) {
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
          <p className="text-sm text-muted-foreground mt-1">欢迎回来，{user?.realName || "用户"}</p>
        </div>
        <div className="md:hidden w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
          <span className="text-primary-foreground font-semibold text-sm">
            {user?.realName ? user.realName.substring(0, 2) : "用户"}
          </span>
        </div>
      </div>

      {/* Search Bar and Time Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="搜索工单号、序列号或故障描述..."
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
                  captionLayout="dropdown"
                  fromYear={2010}
                  toYear={new Date().getFullYear() + 5}
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
                {repairs.filter(r => r && (normalizeTicketStatus(r.status) === TicketStatus.CREATED || normalizeTicketStatus(r.status) === TicketStatus.WAREHOUSE_CONFIRMING)).length}
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
              filteredTasks.map((task, taskIdx) => (
                <Card
                  key={task.id ? `task-db-${task.id}` : `task-fallback-${taskIdx}`}
                  className="border-border/50 dark:border-border hover:border-primary/50 dark:hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer active:scale-[0.98] bg-card/50 dark:bg-card backdrop-blur-sm"
                  onClick={() => {
                    // 如果有批次ID（不管是批次工单还是批次中的单个设备），都跳转到批次详情页
                    // 这样可以查看批次级别的聊天和签字凭证
                    if (task.batchId) {
                      router.push(`/batch/${task.batchId}`);
                    } else {
                      onStartRepair(task.id);
                    }
                  }}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getPriorityIndicator(task.priority)}
                          <h3 className="font-semibold text-foreground truncate text-base">
                            {task.isBatch ? (
                              <>工单号：{task.batchId}</>
                            ) : (
                              <>序列号：{task.deviceSerialNumber}</>
                            )}
                          </h3>
                          {/* 消息红点提示 - 仅批次工单，仅当有未读消息时显示 */}
                          {task.isBatch && (() => {
                            const unread = getUnreadCount(task.batchId, task.rawData?.messageCount || 0);
                            if (unread <= 0) return null;
                            return (
                              <div className="relative inline-flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 text-[8px] font-bold text-white items-center justify-center">
                                    {unread > 9 ? '9+' : unread}
                                  </span>
                                </span>
                              </div>
                            );
                          })()}
                          {/* 签字凭证图标 - 仅批次工单 */}
                          {task.isBatch && task.rawData?.signedReportPhoto && (
                            <div className="inline-flex items-center text-green-600" title="已上传签字凭证">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        {task.isBatch ? (
                          <>
                            <div className="flex items-start gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2 mb-2">
                              <span className="text-muted-foreground dark:text-muted-foreground">
                                项目：{task.projectName || "未知项目"}
                              </span>
                            </div>
                            <div className="flex items-start gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2 mb-2">
                              <span className="text-muted-foreground dark:text-muted-foreground">
                                联系人：{task.contactInfo || "无联系信息"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs">
                                {task.deviceCount} 台设备
                              </Badge>
                              {task.devices && task.devices.slice(0, 3).map((device: any, idx: number) => (
                                <Badge
                                  key={device.id ? `badge-db-${device.id}` : `badge-${task.batchId}-${idx}`}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {device.deviceSerialNumber}
                                </Badge>
                              ))}
                              {task.deviceCount > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{task.deviceCount - 3} 台
                                </span>
                              )}
                            </div>
                            {/* 维修报告按钮 - 只在批次工单显示 */}
                            <div className="mt-3 pt-3 border-t border-border/50 flex gap-2">
                              {/* 只有维修人员和管理员可以编辑维修报告 */}
                              {(user?.role === UserRole.TECHNICIAN || user?.role === UserRole.ADMIN) ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/repairs/edit/${task.batchId}`);
                                    }}
                                  >
                                    <FileText className="w-3 h-3 mr-1" />
                                    编辑维修报告
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/repairs/print/${task.batchId}`);
                                    }}
                                  >
                                    <Printer className="w-3 h-3 mr-1" />
                                    打印报告
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/repairs/print/${task.batchId}`);
                                  }}
                                >
                                  <FileText className="w-3 h-3 mr-1" />
                                  {user?.role === UserRole.REPORTER ? "查看维修报告" : "查看报告"}
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                        <div className="flex items-start gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2">
                          <AlertCircle className="w-4 h-4 text-muted-foreground dark:text-muted-foreground mt-0.5 shrink-0" />
                          <span className="text-muted-foreground dark:text-muted-foreground line-clamp-2">{task.fault}</span>
                        </div>
                        )}
                        {/* 工作流进度 - 只对非批次工单显示 */}
                        {!task.isBatch && task.rawData && (
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
                        {/* 待补录 SN 提示 - 只对非批次工单显示，且非最终维修状态 */}
                        {!task.isBatch && (() => {
                          // 特殊情况：最终维修状态下，序列号可以为空，不显示"待补录"
                          const isTerminal = isTerminalStatus(task.status)
                          const needsSupplement = !isTerminal && (
                            !task.productSN || 
                            (typeof task.productSN === 'string' && task.productSN.trim() === "") || 
                            (typeof task.productSN === 'string' && task.productSN.toUpperCase() === "PENDING") ||
                            (typeof task.deviceSerialNumber === 'string' && task.deviceSerialNumber?.toUpperCase() === "PENDING")
                          )
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
                      <div key={repair.id ? `activity-${repair.id}` : `activity-idx-${index}`} className="flex items-start gap-3 text-sm p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                          normalizeTicketStatus(repair.status) === TicketStatus.COMPLETED ? "bg-success" : 
                          normalizeTicketStatus(repair.status) === TicketStatus.IN_REPAIR ? "bg-primary" : 
                          normalizeTicketStatus(repair.status) === TicketStatus.CREATED ? "bg-warning" : "bg-muted-foreground"
                        }`}></div>
                      <p className="text-muted-foreground leading-relaxed">{
                          normalizeTicketStatus(repair.status) === TicketStatus.COMPLETED ? `完成 ${repair.deviceName || repair.deviceModel || '设备'} 的维修` :
                          normalizeTicketStatus(repair.status) === TicketStatus.IN_REPAIR ? `正在处理 ${repair.deviceName || repair.deviceModel || '设备'}` :
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

      {/* 批次设备选择弹窗 - 已废弃，现在直接跳转到批次详情页 */}
      {/* <Dialog open={isBatchDeviceDialogOpen} onOpenChange={setIsBatchDeviceDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>选择要处理的设备</DialogTitle>
            <div className="text-sm text-muted-foreground mt-2">
              <p>工单号：{selectedBatchTask?.batchId}</p>
              <p>项目：{selectedBatchTask?.projectName}</p>
              <p>联系人：{selectedBatchTask?.contactInfo}</p>
            </div>
          </DialogHeader>
          <div className="grid gap-3 mt-4">
            {selectedBatchTask?.devices && selectedBatchTask.devices.map((device: any, idx: number) => (
              <Card 
                key={`${selectedBatchTask.batchId}-device-select-${idx}`}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                onClick={() => {
                  setIsBatchDeviceDialogOpen(false);
                  onStartRepair(device.id, {
                    batchId: selectedBatchTask.batchId,
                    devices: selectedBatchTask.devices
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{device.deviceSerialNumber || "未填写"}</Badge>
                        {device.deviceName && (
                          <span className="text-sm font-medium">{device.deviceName}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {device.fault || "无故障描述"}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchDeviceDialogOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog> */}
    </div>
  )
}
