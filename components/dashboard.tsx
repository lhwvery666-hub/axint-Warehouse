"use client"

import { ChevronRight, Clock, Wrench, AlertCircle, CheckCircle, Calendar, FileText, Printer } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { WorkOrderListRow } from "@/components/work-order-list-row"
import { WorkOrderCardStack } from "@/components/work-order-card-stack"
import { WorkOrderFilterBar } from "@/components/work-order-filter-bar"
import { getPendingStatusesForRole, calculateProgress, getCurrentStep, resolveTimeFilterPool, getTimeFilterTargetDate } from "@/lib/workflow-utils"
import { TicketStatus, UserRole, normalizeTicketStatus, isTerminalStatus, TICKET_STATUS_LABELS } from "@/lib/enums"
import { ALL_REPAIR_STATUS_FILTER, matchesRepairListFilters } from "@/lib/repair-list-filters"
import { sumDeviceQuantity } from "@/lib/device-quantity"
import WorkflowProgress from "@/components/workflow-progress"

interface DashboardProps {
  onStartRepair: (taskId: string, batchContext?: { batchId: string; devices: any[] }) => void
}

const DASHBOARD_STATUS_FILTER = {
  ALL: "all",
  PENDING: "pending",
  ACTIVE: "active",
} as const

const DASHBOARD_STATUS_FILTER_OPTIONS = [
  { value: DASHBOARD_STATUS_FILTER.PENDING, label: "待处理" },
  { value: DASHBOARD_STATUS_FILTER.ACTIVE, label: "进行中（含已延期）" },
] as const

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
  
  // 从 URL 参数恢复联合筛选状态；q 为旧版综合搜索参数的兼容入口
  const [workOrderQuery, setWorkOrderQuery] = useState(() => {
    return searchParams.get("workOrder") || searchParams.get("q") || "";
  });
  const [customerQuery, setCustomerQuery] = useState(() => searchParams.get("customer") || "");
  const [deviceQuery, setDeviceQuery] = useState(() => searchParams.get("device") || "");
  
  // 时间筛选状态 - 从 URL 参数恢复
  const [filterTimeRange, setFilterTimeRange] = useState<string>(() => {
    return searchParams.get("time") || "all";
  });

  // 统计卡片联动的状态筛选："all" | "pending"（待处理） | "active"（进行中，含已延期）
  // 从 URL 参数恢复，保证刷新/分享链接后筛选状态不丢失
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    return searchParams.get("status") || DASHBOARD_STATUS_FILTER.ALL;
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
          quantity: repair.quantity,
          deviceSerialNumber: repair.deviceSerialNumber || "",
          productSN: repair.productSN || repair.deviceSerialNumber || "",
          expectedCompletionDate: repair.expectedCompletionDate,
          progress: progress.completionRate,
          canProceed: progress.canProceed,
          rawData: repair, // 保存原始数据用于进度显示
          batchId: (repair as any).batchId || null, // 批次ID
          projectName: (repair as any).projectName || repair.projectLocation || repair.location || "",
          projectLocation: repair.projectLocation || "",
          customerName: repair.customerName || "",
          contactInfo: (repair as any).contactInfo || "",
          reportedBy: repair.reportedBy || "",
          reportedByUsername: repair.reportedByUsername || "",
          reportedByUserId: repair.reportedByUserId || "",
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
          batchTask.deviceCount = sumDeviceQuantity(batchTask.devices);
        } else {
          // 新批次，创建批次任务对象
          batchMap.set(task.batchId, {
            id: task.batchId,
            isBatch: true,
            batchId: task.batchId,
            projectName: task.projectName || "未知项目",
            contactInfo: task.contactInfo || "无联系信息",
            deviceCount: sumDeviceQuantity([task]),
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
  // ⚠️ 阶段2：时间比较的靶向字段不再固定为上报时间，而是跟随当前状态筛选（filterStatus）动态切换：
  // 完工池（已完成）→ warehouseShippedAt（缺失时降级 updatedAt）；商务池（待发货）→ businessReviewedAt；
  // 其余（待处理/进行中/全部）保持原有的 reportedAt 基础逻辑。详见 lib/workflow-utils.ts。
  const filterTasksByTimeRange = (task: any) => {
    if (filterTimeRange === "all") return true;
    
    const baseReportDate = task.reportedAtFull || task.reportedAt;
    const pool = resolveTimeFilterPool(filterStatus);
    const fullReportDate = getTimeFilterTargetDate(pool, task.rawData, baseReportDate);
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
      
      if (workOrderQuery.trim()) {
        params.set("workOrder", workOrderQuery.trim());
      }
      if (customerQuery.trim()) {
        params.set("customer", customerQuery.trim());
      }
      if (deviceQuery.trim()) {
        params.set("device", deviceQuery.trim());
      }
      
      if (filterTimeRange !== "all") {
        params.set("time", filterTimeRange);
      }

      if (filterStatus !== DASHBOARD_STATUS_FILTER.ALL) {
        params.set("status", filterStatus);
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
  }, [workOrderQuery, customerQuery, deviceQuery, filterTimeRange, filterStatus, dateRange, router]);

  // 搜索、时间、状态过滤
  useEffect(() => {
    let filtered = Array.isArray(tasks) ? tasks : [];

    // 统计卡片联动过滤：与卡片计数口径保持一致
    if (filterStatus === DASHBOARD_STATUS_FILTER.PENDING) {
      filtered = filtered.filter(task => {
        const normalized = normalizeTicketStatus(task.status)
        return normalized === TicketStatus.CREATED || normalized === TicketStatus.WAREHOUSE_CONFIRMING
      });
    } else if (filterStatus === DASHBOARD_STATUS_FILTER.ACTIVE) {
      filtered = filtered.filter(task => {
        const normalized = normalizeTicketStatus(task.status)
        return normalized === TicketStatus.IN_REPAIR || normalized === TicketStatus.DELAYED
      });
    }

    filtered = filtered.filter(filterTasksByTimeRange);
    
    filtered = filtered.filter(task => matchesRepairListFilters(task, {
      workOrderQuery,
      customerQuery,
      deviceQuery,
      status: ALL_REPAIR_STATUS_FILTER,
    }));
    
    setFilteredTasks(filtered);
  }, [workOrderQuery, customerQuery, deviceQuery, filterTimeRange, filterStatus, dateRange, tasks]);
  
  // ⚠️ 曾经的 bug：这里的分支没有覆盖仓库确认中/仓库已确认/仓库待发货等新流程状态，
  // 且 ADMIN_REVIEW / PENDING_SHIPMENT 是已被 normalizeTicketStatus 归并掉的旧枚举值，永远不会命中，
  // 导致这些状态的工单无法显示正确徽章（叠加 RepairContext 的另一个 bug后，会显示成"待处理"）。
  // 修复：统一先用 normalizeTicketStatus 归一化，再用 TICKET_STATUS_LABELS 取文案，覆盖所有状态。
  const getStatusBadge = (status: TicketStatus | string) => {
    const normalized = normalizeTicketStatus(status as string)
    if (!normalized) return null
    const label = TICKET_STATUS_LABELS[normalized]

    if (normalized === TicketStatus.CREATED) {
      return (
        <Badge className="bg-warning/15 text-warning-foreground border-warning/30 hover:bg-warning/20">
          <Clock className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.WAREHOUSE_CONFIRMING) {
      return (
        <Badge className="bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200">
          <Clock className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.WAREHOUSE_CONFIRMED) {
      return (
        <Badge className="bg-teal-100 text-teal-800 border-teal-300 hover:bg-teal-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.IN_REPAIR) {
      return (
        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
          <Wrench className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.PENDING_REPORTER_CONFIRM) {
      return (
        <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.TECHNICIAN_REPAIRING) {
      return (
        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200">
          <Wrench className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.BUSINESS_REVIEW) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.WAREHOUSE_SHIPPING) {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.COMPLETED) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.UNREPAIRABLE) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalized === TicketStatus.DELAYED) {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 text-xs">
          <Clock className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else {
      // 其余状态（取消/报废/拒修等）统一用灰色徽章兜底，不再吞掉不显示
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {label}
        </Badge>
      )
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

      {/* Multi-condition search bar and existing time filter */}
      <WorkOrderFilterBar
        workOrderQuery={workOrderQuery}
        customerQuery={customerQuery}
        deviceQuery={deviceQuery}
        status={filterStatus}
        statusOptions={DASHBOARD_STATUS_FILTER_OPTIONS}
        onWorkOrderQueryChange={setWorkOrderQuery}
        onCustomerQueryChange={setCustomerQuery}
        onDeviceQueryChange={setDeviceQuery}
        onStatusChange={setFilterStatus}
        trailing={(
          <>
          <Select value={filterTimeRange} onValueChange={setFilterTimeRange}>
            <SelectTrigger className="h-10 min-w-0 flex-1 border-border/50 bg-background shadow-sm dark:border-border dark:bg-background">
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
                    "h-10 min-w-[180px] justify-start border-border/50 bg-background text-left font-normal shadow-sm dark:border-border dark:bg-background",
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
          </>
        )}
      />

      {/* Quick Stats —— 点击可联动过滤下方工单列表，再点一次取消筛选 */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card
          onClick={() => setFilterStatus(prev => prev === DASHBOARD_STATUS_FILTER.PENDING ? DASHBOARD_STATUS_FILTER.ALL : DASHBOARD_STATUS_FILTER.PENDING)}
          className={cn(
            "gap-0 py-0 border-border/50 dark:border-border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/20 dark:to-primary/15 bg-card dark:bg-card cursor-pointer select-none",
            filterStatus === DASHBOARD_STATUS_FILTER.PENDING && "ring-2 ring-primary border-primary"
          )}
        >
          <CardContent className="px-3 py-2.5 text-center">
            <div className="flex items-center justify-center mb-0.5">
              <Clock className="h-4 w-4 text-primary mr-2" />
              <p className="text-2xl md:text-3xl font-bold text-primary leading-none">
                {repairs.filter(r => r && (normalizeTicketStatus(r.status) === TicketStatus.CREATED || normalizeTicketStatus(r.status) === TicketStatus.WAREHOUSE_CONFIRMING)).length}
              </p>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              待处理{filterStatus === DASHBOARD_STATUS_FILTER.PENDING && "（已筛选，点击取消）"}
            </p>
          </CardContent>
        </Card>
        <Card
          onClick={() => setFilterStatus(prev => prev === DASHBOARD_STATUS_FILTER.ACTIVE ? DASHBOARD_STATUS_FILTER.ALL : DASHBOARD_STATUS_FILTER.ACTIVE)}
          className={cn(
            "gap-0 py-0 border-border/50 dark:border-border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-warning/5 to-warning/10 dark:from-warning/20 dark:to-warning/15 bg-card dark:bg-card cursor-pointer select-none",
            filterStatus === DASHBOARD_STATUS_FILTER.ACTIVE && "ring-2 ring-warning border-warning"
          )}
        >
          <CardContent className="px-3 py-2.5 text-center">
            <div className="flex items-center justify-center mb-0.5">
              <Wrench className="h-4 w-4 text-warning mr-2" />
              <p className="text-2xl md:text-3xl font-bold text-warning leading-none">
                {repairs.filter(r => r && (r.status === "processing" || r.status === "in_repair" || r.status === "delayed")).length}
              </p>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              进行中（含已延期）{filterStatus === DASHBOARD_STATUS_FILTER.ACTIVE && "（已筛选，点击取消）"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="space-y-4">
          {/* Task List Header */}
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-lg md:text-xl font-bold text-foreground">维修工单</h2>
            <Button variant="ghost" size="sm" className="text-primary text-sm h-9 hover:bg-primary/10" onClick={() => onStartRepair("all")}>
              查看全部 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          {/* Task List —— 紧凑列表模式 */}
          <Card className="gap-0 border-0 bg-transparent py-0 shadow-none overflow-visible">
            {filteredTasks.length > 0 ? (
              <WorkOrderCardStack>
                {filteredTasks.map((task, taskIdx) => {
                  const unread = task.isBatch ? getUnreadCount(task.batchId, task.rawData?.messageCount || 0) : 0
                  const isTerminal = isTerminalStatus(task.status)
                  const needsSupplement = !task.isBatch && !isTerminal && (
                    !task.productSN ||
                    (typeof task.productSN === 'string' && task.productSN.trim() === "") ||
                    (typeof task.productSN === 'string' && task.productSN.toUpperCase() === "PENDING") ||
                    (typeof task.deviceSerialNumber === 'string' && task.deviceSerialNumber?.toUpperCase() === "PENDING")
                  )

                  return (
                    <WorkOrderListRow
                      key={task.id ? `task-db-${task.id}` : `task-fallback-${taskIdx}`}
                      className="h-full last:border-b"
                      compact
                      title={task.isBatch ? `工单号：${task.batchId}` : `工单号：${task.workOrderNumber || task.id}`}
                      isBatch={task.isBatch}
                      projectName={task.isBatch ? task.projectName : undefined}
                      customerName={task.customerName || task.devices?.[0]?.customerName}
                      reportedBy={task.reportedBy || task.devices?.[0]?.reportedBy}
                      reportedByUsername={task.reportedByUsername || task.devices?.[0]?.reportedByUsername}
                      contactInfo={task.isBatch ? task.contactInfo : undefined}
                      deviceCount={task.isBatch ? task.deviceCount : undefined}
                      deviceSerials={task.isBatch && task.devices ? task.devices.map((d: any) => d.deviceSerialNumber) : undefined}
                      deviceSerialNumber={task.deviceSerialNumber}
                      deviceModel={task.deviceModel}
                      deviceModels={task.isBatch && task.devices ? task.devices.map((d: any) => d.deviceModel) : undefined}
                      faultText={task.fault}
                      priorityIndicator={getPriorityIndicator(task.priority)}
                      statusNode={getStatusBadge(task.status)}
                      reportedAt={task.reportedAt}
                      unreadCount={unread}
                      hasSignedPhoto={task.isBatch && !!task.rawData?.signedReportPhoto}
                      delayedText={
                        task.status === "delayed" && task.expectedCompletionDate
                          ? `延期至 ${format(new Date(task.expectedCompletionDate), "MM-dd")}`
                          : undefined
                      }
                      pendingSnText={needsSupplement ? "待补录 SN" : undefined}
                      onClick={() => {
                        // 如果有批次ID（不管是批次工单还是批次中的单个设备），都跳转到批次详情页
                        // 这样可以查看批次级别的聊天和签字凭证
                        // 携带 from=home，方便详情页"返回"时能回到首页而不是被重置
                        if (task.batchId) {
                          router.push(`/batch/${task.batchId}?from=home`);
                        } else {
                          onStartRepair(task.id);
                        }
                      }}
                      belowContent={
                        !task.isBatch && task.rawData ? (
                          <div>
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
                        ) : undefined
                      }
                      actions={
                        task.isBatch ? (
                          (user?.role === UserRole.TECHNICIAN || user?.role === UserRole.ADMIN) ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                onClick={() => router.push(`/repairs/edit/${task.batchId}`)}
                              >
                                <FileText className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                onClick={() => router.push(`/repairs/print/${task.batchId}`)}
                              >
                                <Printer className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 px-2"
                              onClick={() => router.push(`/repairs/print/${task.batchId}`)}
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              {user?.role === UserRole.REPORTER ? "查看维修报告" : "查看报告"}
                            </Button>
                          )
                        ) : undefined
                      }
                    />
                  )
                })}
              </WorkOrderCardStack>
            ) : (
              <CardContent className="rounded-xl border border-border/50 bg-card p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">
                  {(workOrderQuery || customerQuery || deviceQuery || filterStatus !== DASHBOARD_STATUS_FILTER.ALL || filterTimeRange !== "all") ? "未找到匹配的工单" : "暂无待办维修任务"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(workOrderQuery || customerQuery || deviceQuery || filterStatus !== DASHBOARD_STATUS_FILTER.ALL || filterTimeRange !== "all") ? "请尝试其他搜索关键词或调整筛选条件" : "请先添加设备和维修数据"}
                </p>
              </CardContent>
            )}
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
