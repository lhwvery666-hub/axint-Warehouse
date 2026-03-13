"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Clock, Wrench, AlertCircle, ChevronRight, Filter, Search, Plus, ArrowLeft, ShieldCheck, ShieldAlert, Calendar, CheckCircle, Package, MessageSquare, FileCheck, Camera, ZoomIn, Download, Copy, FileText, DollarSign, Send, ClipboardList, PenTool } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format, isAfter, isBefore, parseISO, subDays, subMonths } from "date-fns"
import { zhCN } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import RepairForm from "@/components/repair-form"
import RepairDetailWrapper from "@/components/repair-detail-wrapper"
import { useRepairContext } from "@/context/RepairContext"
import { TicketChat } from "@/components/TicketChat"
import { UserRole, TicketStatus, normalizeTicketStatus, OperationLogType, OPERATION_LOG_TYPE_LABELS, isTerminalStatus } from "@/lib/enums"
import { toast } from "sonner"

// ==================== 类型定义 ====================
/**
 * 操作日志接口
 */
interface OperationLog {
  type: OperationLogType
  time: string
  operator: string
  description: string
}

/**
 * 设备接口（批次上下文）
 */
interface BatchDevice {
  id: string
  deviceSerialNumber?: string
  productSN?: string
  deviceName?: string
  deviceModel?: string
  status?: string
  problem?: string
  fault?: string
  repairReason?: string
}

interface RepairPageProps {
  onBack?: () => void
  taskId?: string | null
  userType?: string
  batchContext?: {
    batchId: string
    devices: BatchDevice[]
  } | null
}

// 将在组件内部获取最新的工单数据

/** 计算某批次的未读消息数（与 localStorage 存储的已读数对比） */
function getUnreadCount(batchId: string, totalCount: number): number {
  if (typeof window === 'undefined' || !batchId) return 0;
  const seen = parseInt(localStorage.getItem(`chat_seen_${batchId}`) || '0', 10);
  return Math.max(0, totalCount - seen);
}

export default function RepairPage({ onBack, taskId, userType, batchContext }: RepairPageProps) {
  const { user } = useAuth()
  const router = useRouter()
  const userRole = userType || user?.role || "technician"
  
  // 使用RepairContext获取维修工单数据
  const { repairs } = useRepairContext();
  
  // 视图状态：tasks(任务列表), new(新建维修), detail(维修详情), batchSelect(批次设备选择)
  // 如果传入了taskId，则直接显示详情页面
  // 如果没有taskId但有batchContext，显示批次设备选择
  const initialView = taskId ? "detail" : (batchContext && !taskId ? "batchSelect" : (userRole === UserRole.REPORTER ? "new" : "tasks"))
  const [view, setView] = useState<"tasks" | "new" | "detail" | "batchSelect">(initialView)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(taskId || null)
  
  // 保存当前选中的批次任务（用于批次设备选择）
  const [currentBatchTask, setCurrentBatchTask] = useState<RepairPageProps['batchContext']>(batchContext || null)
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  
  // 当批次任务改变时，获取操作记录
  useEffect(() => {
    const fetchOperationLogs = async () => {
      const batchId = currentBatchTask?.batchId || batchContext?.batchId
      if (!batchId) {
        setOperationLogs([])
        return
      }

      try {
        const response = await fetch(`/api/tickets/batch-operation-logs/${batchId}`)
        const result = await response.json()
        if (result.success && result.data) {
          setOperationLogs(result.data.operations || [])
        }
      } catch (error) {
        console.error('获取操作记录失败:', error)
      }
    }

    fetchOperationLogs()
  }, [currentBatchTask, batchContext])
  
  // 当taskId变化时更新视图
  useEffect(() => {
    if (taskId) {
      setView("detail")
      setSelectedTaskId(taskId)
    } else if (batchContext) {
      setView("batchSelect")
      setSelectedTaskId(null)
    } else if (!taskId && view === "detail") {
      // 从详情页返回时，如果有批次上下文，显示批次选择，否则显示任务列表
      setView(batchContext ? "batchSelect" : "tasks")
    }
  }, [taskId, batchContext])
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterTimeRange, setFilterTimeRange] = useState<string>("all")
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined
  })
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  
  // 获取最新的工单数据
  const [tasks, setTasks] = useState<any[]>([])
  
  // 在组件加载时和视图切换时获取最新数据
  useEffect(() => {
    // 转换为组件需要的格式
    const formattedTasks = repairs.map((repair) => ({
      id: repair.id,
      deviceId: repair.deviceId,
      // 列表卡片只显示产品名称，避免前缀太长
      deviceName: repair.deviceName || repair.deviceModel || "未知设备",
      deviceSerialNumber: repair.deviceSerialNumber,
      productSN: repair.productSN || repair.deviceSerialNumber || "", // ProductSN 字段
      location: repair.location,
      fault: repair.problem,
      status: repair.status,
      priority: repair.priority,
      reportedAt: repair.reportedAt,
      inWarranty: repair.inWarranty,
      warrantyEnd: repair.warrantyEnd,
      expectedCompletionDate: repair.expectedCompletionDate,
      // 批次相关字段
      batchId: (repair as any).batchId || null,
      projectName: (repair as any).projectName || repair.projectLocation || "",
      contactInfo: (repair as any).contactInfo || "",
      rawData: repair, // 保存原始数据
    }));
    
    // 🔧 批次分组逻辑：将同一batchId的工单合并为一个批次任务
    console.log('🔧 RepairPage - 开始批次分组，formattedTasks数量:', formattedTasks.length);
    
    const batchMap = new Map<string, any>();
    const individualTasks: any[] = [];
    
    formattedTasks.forEach((task) => {
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
            devices: [task], // 该批次包含的所有设备
            rawData: task.rawData, // 保存原始数据
          });
        }
      } else {
        // 没有batchId，作为单独工单处理
        individualTasks.push(task);
      }
    });
    
    // 合并批次任务和单独任务
    const groupedTasks = [...Array.from(batchMap.values()), ...individualTasks];
    
    console.log('✅ RepairPage - 批次分组完成:', {
      批次数: batchMap.size,
      单独工单数: individualTasks.length,
      总任务数: groupedTasks.length
    });
    
    setTasks(groupedTasks);
  }, [repairs, view]); // 当repairs或视图变化时重新获取数据

  const getStatusBadge = (status: string) => {
    // 使用枚举进行状态匹配
    const normalizedStatus = normalizeTicketStatus(status)
    
    if (normalizedStatus === TicketStatus.CREATED || normalizedStatus === TicketStatus.WAREHOUSE_CONFIRMING) {
      return (
        <Badge className="bg-warning/15 text-warning-foreground border-warning/30 hover:bg-warning/20">
          <Clock className="w-3 h-3 mr-1" />
          待处理
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.IN_REPAIR) {
      return (
        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
          <Wrench className="w-3 h-3 mr-1" />
          维修中
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.BUSINESS_REVIEW) {
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
    } else if (normalizedStatus === TicketStatus.COMPLETED.toLowerCase()) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
          <AlertCircle className="w-3 h-3 mr-1" />
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

  const getPriorityIndicator = (priority: "high" | "medium" | "low" | "critical") => {
    const colors = {
      critical: "bg-purple-500",
      high: "bg-destructive",
      medium: "bg-warning",
      low: "bg-success",
    }
    return <span className={`w-2 h-2 rounded-full ${colors[priority] || colors.medium}`} />
  }

  const handleViewTask = (taskId: string) => {
    setSelectedTaskId(taskId)
    setView("detail")
  }

  const handleNewRepair = () => {
    setSelectedTaskId(null)
    setView("new")
  }

  const handleBackToTasks = () => {
    setSelectedTaskId(null)
    // 如果有批次上下文，返回批次选择页面；否则返回任务列表
    if (currentBatchTask) {
      setView("batchSelect")
    } else {
      setView("tasks")
    }
  }

  // 根据时间范围过滤任务
  const filterTasksByTimeRange = (task: any) => {
    if (filterTimeRange === "all") return true;
    
    // 获取完整的reportedAt日期字符串，而不是只取时间部分
    const fullReportDate = task.reportedAt.includes(" ") ? 
      task.reportedAt : 
      repairs.find(r => r.id === task.id)?.reportedAt || "";
    
    // 解析日期字符串为Date对象
    const taskDate = parseISO(fullReportDate.split(" ")[0]);
    const today = new Date();
    
    // 添加调试日志
    console.log("Task date:", taskDate, "Full report date:", fullReportDate);
    
    switch (filterTimeRange) {
      case "today":
        return taskDate.toDateString() === today.toDateString();
      case "week":
        return isAfter(taskDate, subDays(today, 7));
      case "month":
        return isAfter(taskDate, subMonths(today, 1));
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
  
  // 先按状态筛选，再按时间筛选，最后按搜索关键词筛选
  // 排除终止状态的工单（Cancelled, Scrapped, Return_Unrepaired）
  const filteredTasks = tasks
    .filter(task => {
      const status = (task.status || "").toString().toLowerCase()
      // 排除终止状态
      if (status === "cancelled" || status === "scrapped" || status === "return_unrepaired") {
        return false
      }
      return true
    })
    .filter(task => 
      filterStatus === "all" || 
      task.status === filterStatus
    )
    .filter(filterTasksByTimeRange)
    .filter(task => {
      if (searchQuery === "") return true
      const q = searchQuery.toLowerCase()
      return (
        (task.workOrderNumber && task.workOrderNumber.toLowerCase().includes(q)) ||
        (task.deviceSerialNumber && task.deviceSerialNumber.toLowerCase().includes(q)) ||
        (task.fault && task.fault.toLowerCase().includes(q))
      )
    })

  // 报告人员使用专门的报告页面，不再在这里处理
  if (userRole === UserRole.REPORTER) {
    return null;
  }

  // 维修人员视图
  return (
    <div className="min-h-screen bg-background">
      {view === "tasks" && (
        <div className="p-4 md:p-6 space-y-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={onBack}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-foreground">
                维修工单管理
              </h1>
              <p className="text-sm text-muted-foreground">
                查看和管理所有维修工单
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* 搜索和筛选 */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="搜索维修工单..." 
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* 状态筛选 */}
              <div className="flex gap-2">
                <select
                  className="px-3 py-2 rounded-md border border-border bg-background text-sm"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">全部状态</option>
                  <option value={TicketStatus.CREATED}>待处理</option>
                  <option value={TicketStatus.IN_REPAIR}>维修中</option>
                  <option value={TicketStatus.PENDING_REPORTER_CONFIRM}>待现场确认</option>
                  <option value={TicketStatus.BUSINESS_REVIEW}>待商务处理</option>
                  <option value={TicketStatus.WAREHOUSE_SHIPPING}>待发货</option>
                  <option value={TicketStatus.COMPLETED}>已完成</option>
                  <option value={TicketStatus.UNREPAIRABLE}>无法维修</option>
                  <option value={TicketStatus.DELAYED}>已延期</option>
                </select>
                
                {/* 时间筛选 */}
                <select
                  className="px-3 py-2 rounded-md border border-border bg-background text-sm"
                  value={filterTimeRange}
                  onChange={(e) => setFilterTimeRange(e.target.value)}
                >
                  <option value="all">所有时间</option>
                  <option value="today">今天</option>
                  <option value="week">最近7天</option>
                  <option value="month">最近30天</option>
                  <option value="custom">自定义时间</option>
                </select>
                
                {/* 自定义时间范围选择器 */}
                {filterTimeRange === "custom" && (
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
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

            {/* 任务统计 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/20 dark:to-primary/15 bg-card dark:bg-card">
                <CardContent className="p-4 md:p-6 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Clock className="h-5 w-5 text-primary mr-2" />
                    <p className="text-3xl md:text-4xl font-bold text-primary">{tasks.filter(t => t.status === "pending").length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">待处理</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-warning/5 to-warning/10 dark:from-warning/20 dark:to-warning/15 bg-card dark:bg-card">
                <CardContent className="p-4 md:p-6 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Wrench className="h-5 w-5 text-warning mr-2" />
                    <p className="text-3xl md:text-4xl font-bold text-warning">{tasks.filter(t => t.status === "processing").length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">进行中</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-success/5 to-success/10 dark:from-success/20 dark:to-success/15 bg-card dark:bg-card">
                <CardContent className="p-4 md:p-6 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <CheckCircle className="h-5 w-5 text-success mr-2" />
                    <p className="text-3xl md:text-4xl font-bold text-success">{tasks.filter(t => normalizeTicketStatus(t.status) === TicketStatus.COMPLETED).length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">已完成</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-destructive/5 to-destructive/10 dark:from-destructive/20 dark:to-destructive/15 bg-card dark:bg-card">
                <CardContent className="p-4 md:p-6 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <AlertCircle className="h-5 w-5 text-destructive mr-2" />
                    <p className="text-3xl md:text-4xl font-bold text-destructive">{tasks.filter(t => t.status === "unrepairable").length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">无法维修</p>
                </CardContent>
              </Card>
            </div>

            {/* 任务列表 */}
            <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task) => (
                  <Card
                    key={task.id}
                    className="border-border/50 dark:border-border hover:border-primary/50 dark:hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer active:scale-[0.98] bg-card/50 dark:bg-card backdrop-blur-sm"
                    onClick={() => {
                      // 如果是批次工单，显示批次设备选择
                      if (task.isBatch && task.devices && task.devices.length > 0) {
                        // 设置批次上下文并切换到批次选择视图
                        setCurrentBatchTask(task);
                        setSelectedTaskId(null);
                        setView("batchSelect");
                      } else if (task.batchId) {
                        // 如果是批次中的单个设备，跳转到批次详情页
                        // 这样可以查看批次级别的聊天和签字凭证
                        router.push(`/batch/${task.batchId}`);
                      } else {
                        handleViewTask(task.id);
                      }
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {getPriorityIndicator(task.priority)}
                          {/* 批次工单显示批次信息，单独工单显示工单号 */}
                          <h3 className="font-semibold text-foreground truncate text-base">
                            {task.isBatch ? (
                              <>工单号：{task.batchId}</>
                            ) : (
                              <>工单号：{task.workOrderNumber || task.id}</>
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
                          {task.inWarranty !== undefined && (
                            task.inWarranty ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                保修内
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                                <ShieldAlert className="w-3 h-3 mr-1" />
                                过保修
                              </Badge>
                            )
                          )}
                        </div>
                        
                        {/* 批次工单显示项目信息和设备数量 */}
                        {task.isBatch ? (
                          <>
                            <p className="text-sm text-muted-foreground mb-1">
                              <span className="font-medium">项目：</span> {task.projectName || "未知项目"}
                            </p>
                            <p className="text-sm text-muted-foreground mb-2">
                              <span className="font-medium">联系人：</span> {task.contactInfo || "无"}
                            </p>
                            <div className="flex items-center gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2">
                              <Package className="w-4 h-4 text-primary shrink-0" />
                              <span className="font-medium text-primary">{task.deviceCount} 台设备</span>
                            </div>
                            {/* 显示设备序列号列表 */}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {task.devices.slice(0, 3).map((device: any, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {device.deviceSerialNumber}
                                </Badge>
                              ))}
                              {task.devices.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{task.devices.length - 3}
                                </Badge>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground mb-2 truncate flex items-center gap-1">
                              <span className="font-medium">序列号:</span> {task.deviceSerialNumber || "未知"}
                            </p>
                            <div className="flex items-start gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2">
                              <AlertCircle className="w-4 h-4 text-muted-foreground dark:text-muted-foreground mt-0.5 shrink-0" />
                              <span className="text-muted-foreground dark:text-muted-foreground line-clamp-2">{task.fault}</span>
                            </div>
                          </>
                        )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {getStatusBadge(task.status)}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{task.reportedAt}</span>
                          {task.status === "delayed" && task.expectedCompletionDate && (
                            <span className="text-[11px] text-amber-500 whitespace-nowrap">
                              延期至 {format(new Date(task.expectedCompletionDate), "yyyy-MM-dd")}
                            </span>
                          )}
                          {/* 待补录 SN 提示 - 最终维修状态下不显示 */}
                          {(() => {
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
                    <p className="text-muted-foreground font-medium">暂无维修任务</p>
                    <p className="text-xs text-muted-foreground mt-1">请点击"新建维修"按钮添加维修任务</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {view === "new" && (
        <div className="p-4 md:p-6 space-y-6">
          <div className="mb-4">
            <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={handleBackToTasks}>
              <ArrowLeft className="w-4 h-4" />
              返回任务列表
            </Button>
          </div>
          <RepairForm taskId={null} onBack={handleBackToTasks} />
        </div>
      )}

      {view === "batchSelect" && (currentBatchTask || batchContext) && (
        <div className="p-4 md:p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => {
                setCurrentBatchTask(null);
                setView("tasks");
              }}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-foreground">
                选择要处理的设备
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                工单号：{(currentBatchTask || batchContext)?.batchId}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                共 {(currentBatchTask || batchContext)?.devices?.length || 0} 个设备
              </p>
            </div>
          </div>

          {(currentBatchTask || batchContext)?.devices && (currentBatchTask || batchContext)?.devices.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(currentBatchTask || batchContext).devices.map((device: any, idx: number) => {
                console.log(`🔍 批次设备 ${idx}:`, device);
                return (
                  <Card
                    key={`batch-device-${idx}-${device.id}`}
                    className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                    onClick={() => handleViewTask(device.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {device.deviceSerialNumber || device.productSN || "未填写"}
                        </Badge>
                        {getStatusBadge(device.status)}
                      </div>
                      <div className="space-y-1">
                        {device.deviceName && (
                          <p className="font-medium text-sm">{device.deviceName}</p>
                        )}
                        {device.deviceModel && !device.deviceName && (
                          <p className="font-medium text-sm">{device.deviceModel}</p>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {device.problem || device.fault || device.repairReason || "无故障描述"}
                        </p>
                      </div>
                      <div className="flex items-center justify-end mt-3">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">该批次没有设备数据</p>
              </CardContent>
            </Card>
          )}

          {/* 工单沟通记录与操作记录 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：工单沟通记录 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  工单沟通记录
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TicketChat 
                  ticketId={(currentBatchTask || batchContext)?.batchId || ''}
                  currentUser={{
                    name: user?.realName || user?.username || "未知用户",
                    role: (user?.role || "admin") as UserRole
                  }}
                />
              </CardContent>
            </Card>

            {/* 右侧：操作记录 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  操作记录
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {operationLogs.length > 0 ? (
                    operationLogs.map((log, index) => {
                      // 根据操作类型设置图标和颜色（使用枚举）
                      let IconComponent = Clock
                      let iconColor = "text-primary"
                      let bgColor = "bg-primary/10"

                      if (log.type === OperationLogType.CREATED) {
                        IconComponent = FileText
                        iconColor = "text-blue-600"
                        bgColor = "bg-blue-100"
                      } else if (log.type === OperationLogType.SUBMITTED) {
                        IconComponent = Send
                        iconColor = "text-sky-600"
                        bgColor = "bg-sky-100"
                      } else if (log.type === OperationLogType.WAREHOUSE_CONFIRMED) {
                        IconComponent = Package
                        iconColor = "text-purple-600"
                        bgColor = "bg-purple-100"
                      } else if (log.type === OperationLogType.REPAIR_REPORT_GENERATED) {
                        IconComponent = ClipboardList
                        iconColor = "text-indigo-600"
                        bgColor = "bg-indigo-100"
                      } else if (log.type === OperationLogType.REPORTER_CONFIRMED) {
                        IconComponent = PenTool
                        iconColor = "text-pink-600"
                        bgColor = "bg-pink-100"
                      } else if (log.type === OperationLogType.TECHNICIAN_COMPLETED) {
                        IconComponent = CheckCircle
                        iconColor = "text-green-600"
                        bgColor = "bg-green-100"
                      } else if (log.type === OperationLogType.BUSINESS_REVIEWED) {
                        IconComponent = DollarSign
                        iconColor = "text-orange-600"
                        bgColor = "bg-orange-100"
                      } else if (log.type === OperationLogType.WAREHOUSE_SHIPPED) {
                        IconComponent = Download
                        iconColor = "text-teal-600"
                        bgColor = "bg-teal-100"
                      }

                      return (
                        <div key={index} className="flex gap-3 items-start">
                          <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center shrink-0`}>
                            <IconComponent className={`h-5 w-5 ${iconColor}`} />
                          </div>
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm">{log.operator}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(log.time), "MM-dd HH:mm", { locale: zhCN })}
                              </p>
                            </div>
                            <p className="text-sm text-muted-foreground">{log.description}</p>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">暂无操作记录</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {view === "detail" && selectedTaskId && (
        <RepairDetailWrapper taskId={selectedTaskId} onBack={handleBackToTasks} />
      )}
    </div>
  )
}