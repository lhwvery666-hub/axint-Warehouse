"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Clock, Wrench, AlertCircle, ChevronRight, Filter, Plus, ArrowLeft, ShieldCheck, ShieldAlert, Calendar, CheckCircle, Package, MessageSquare, FileCheck, Camera, ZoomIn, Download, Copy, FileText, DollarSign, Send, ClipboardList, PenTool } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format, parseISO } from "date-fns"
import { zhCN } from "date-fns/locale"
import { cn, toBeijingTime } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import RepairForm from "@/components/repair-form"
import RepairDetailWrapper from "@/components/repair-detail-wrapper"
import { useRepairContext } from "@/context/RepairContext"
import { TicketChat } from "@/components/TicketChat"
import { UserRole, TicketStatus, normalizeTicketStatus, OperationLogType, OPERATION_LOG_TYPE_LABELS, isTerminalStatus, TICKET_STATUS_LABELS } from "@/lib/enums"
import { toast } from "sonner"
import { WorkOrderListRow } from "@/components/work-order-list-row"
import { WorkOrderCardStack } from "@/components/work-order-card-stack"
import { WorkOrderFilterBar } from "@/components/work-order-filter-bar"
import { WorkOrderPagination } from "@/components/work-order-pagination"
import { resolveTimeFilterPool, getTimeFilterTargetDate } from "@/lib/workflow-utils"
import {
  ALL_REPAIR_STATUS_FILTER,
  matchesRepairListFilters,
  matchesRepairSummaryFilter,
  matchesRepairTimeRange,
  parseRepairSummaryFilter,
  REPAIR_STATUS_FILTER_OPTIONS,
  REPAIR_SUMMARY_FILTER,
  type RepairSummaryFilter,
} from "@/lib/repair-list-filters"
import { sumDeviceQuantity } from "@/lib/device-quantity"
import { clampPage, paginateItems, parsePageParam } from "@/lib/pagination"

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
  quantity?: number
}

interface RepairPageProps {
  onBack?: () => void | Promise<void>
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
  const searchParams = useSearchParams()
  const userRole = userType || user?.role || "technician"
  
  // 使用RepairContext获取维修工单数据
  const { repairs, refreshRepairs, error: repairsError } = useRepairContext();
  
  // 视图状态：tasks(任务列表), new(新建维修), detail(维修详情), batchSelect(批次设备选择)
  // 如果传入了taskId，则直接显示详情页面
  // 如果没有taskId但有batchContext，显示批次设备选择
  const initialView = taskId ? "detail" : (batchContext && !taskId ? "batchSelect" : (userRole === UserRole.REPORTER ? "new" : "tasks"))
  const [view, setView] = useState<"tasks" | "new" | "detail" | "batchSelect">(initialView)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(taskId || null)
  
  // 保存当前选中的批次任务（用于批次设备选择）
  const [currentBatchTask, setCurrentBatchTask] = useState<RepairPageProps['batchContext']>(batchContext || null)
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  const activeBatchContext = currentBatchTask ?? batchContext
  
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
  const [workOrderQuery, setWorkOrderQuery] = useState(() => searchParams.get("repairWorkOrder") || "")
  const [customerQuery, setCustomerQuery] = useState(() => searchParams.get("repairCustomer") || "")
  const [deviceQuery, setDeviceQuery] = useState(() => searchParams.get("repairDevice") || "")
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    const requestedStatus = searchParams.get("repairStatus")
    return REPAIR_STATUS_FILTER_OPTIONS.some((option) => option.value === requestedStatus)
      ? requestedStatus as string
      : ALL_REPAIR_STATUS_FILTER
  })
  const [summaryFilter, setSummaryFilter] = useState<RepairSummaryFilter>(() => (
    parseRepairSummaryFilter(searchParams.get("repairSummary"))
  ))
  const [filterTimeRange, setFilterTimeRange] = useState<string>(() => {
    const requestedRange = searchParams.get("repairTime")
    return ["all", "today", "week", "month", "custom"].includes(requestedRange || "")
      ? requestedRange as string
      : "all"
  })
  const [currentPage, setCurrentPage] = useState(() => parsePageParam(searchParams.get("repairPage")))
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>(() => ({
    from: searchParams.get("repairFrom") ? parseISO(searchParams.get("repairFrom") as string) : undefined,
    to: searchParams.get("repairTo") ? parseISO(searchParams.get("repairTo") as string) : undefined,
  }))
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  const buildRepairListUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", "repair")

    const setOrDelete = (key: string, value: string) => {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }

    setOrDelete("repairWorkOrder", workOrderQuery.trim())
    setOrDelete("repairCustomer", customerQuery.trim())
    setOrDelete("repairDevice", deviceQuery.trim())
    setOrDelete("repairStatus", filterStatus === ALL_REPAIR_STATUS_FILTER ? "" : filterStatus)
    setOrDelete("repairSummary", summaryFilter === REPAIR_SUMMARY_FILTER.ALL ? "" : summaryFilter)
    setOrDelete("repairTime", filterTimeRange === "all" ? "" : filterTimeRange)
    setOrDelete("repairPage", currentPage === 1 ? "" : String(currentPage))

    if (filterTimeRange === "custom") {
      setOrDelete("repairFrom", dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "")
      setOrDelete("repairTo", dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : "")
    } else {
      params.delete("repairFrom")
      params.delete("repairTo")
    }

    return `/?${params.toString()}`
  }, [
    currentPage,
    customerQuery,
    dateRange.from,
    dateRange.to,
    deviceQuery,
    filterStatus,
    filterTimeRange,
    searchParams,
    summaryFilter,
    workOrderQuery,
  ])
  
  // 获取最新的工单数据
  const [tasks, setTasks] = useState<any[]>([])
  
  // 在组件加载时和视图切换时获取最新数据
  useEffect(() => {
    // 转换为组件需要的格式
    const formattedTasks = repairs.map((repair) => ({
      id: repair.id,
      workOrderNumber: repair.workOrderNumber || "",
      deviceId: repair.deviceId,
      // 列表卡片只显示产品名称，避免前缀太长
      deviceName: repair.deviceName || repair.deviceModel || "未知设备",
      deviceModel: repair.deviceModel || "",
      quantity: repair.quantity,
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
      projectName: (repair as any).projectName || repair.projectLocation || repair.location || "",
      customerName: repair.customerName || "",
      contactInfo: (repair as any).contactInfo || "",
      reportedBy: repair.reportedBy || "",
      reportedByUsername: repair.reportedByUsername || "",
      reportedByUserId: repair.reportedByUserId || "",
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

  // 所有原始状态先归一化；历史“仓库已确认/延期”均按维修检查中展示。
  const getStatusBadge = (status: string) => {
    const normalizedStatus = normalizeTicketStatus(status)
    if (!normalizedStatus) return null
    const label = TICKET_STATUS_LABELS[normalizedStatus]

    if (normalizedStatus === TicketStatus.CREATED) {
      return (
        <Badge className="bg-warning/15 text-warning-foreground border-warning/30 hover:bg-warning/20">
          <Clock className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.WAREHOUSE_CONFIRMING) {
      return (
        <Badge className="bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200">
          <Clock className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.IN_REPAIR) {
      return (
        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
          <Wrench className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.PENDING_REPORTER_CONFIRM) {
      return (
        <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.TECHNICIAN_REPAIRING) {
      return (
        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200">
          <Wrench className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.BUSINESS_REVIEW) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.WAREHOUSE_SHIPPING) {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.COMPLETED) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else if (normalizedStatus === TicketStatus.UNREPAIRABLE) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          {label}
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {label}
        </Badge>
      )
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

  const handleBackToTasks = async () => {
    await refreshRepairs()
    setSelectedTaskId(null)
    // 如果有批次上下文，返回批次选择页面；否则返回任务列表
    if (currentBatchTask) {
      setView("batchSelect")
    } else {
      setView("tasks")
    }
  }

  // 根据时间范围过滤任务
  // ⚠️ 阶段2：时间比较的靶向字段跟随状态筛选（filterStatus）动态切换：
  // filterStatus === TicketStatus.COMPLETED（已完成）→ warehouseShippedAt（缺失时降级 updatedAt）；
  // filterStatus === TicketStatus.WAREHOUSE_SHIPPING（待发货）→ businessReviewedAt；
  // 其余状态 / "全部" → 保持原有的 reportedAt 基础逻辑。详见 lib/workflow-utils.ts。
  const filterTasksByTimeRange = (task: any) => {
    if (filterTimeRange === "all") return true;

    // API 返回的是完整 ISO 时间。批次 task.id 是 batchId，不能用它回查单设备 id，
    // 否则 ISO 字符串会被错误丢弃，导致“今天”筛选始终为空。
    const baseReportDate = task.reportedAt ||
      task.devices?.[0]?.reportedAt ||
      repairs.find(r => r.id === task.id)?.reportedAt ||
      "";

    const effectiveTimeStatus = summaryFilter === REPAIR_SUMMARY_FILTER.COMPLETED
      ? TicketStatus.COMPLETED
      : filterStatus;
    const pool = resolveTimeFilterPool(effectiveTimeStatus);
    const fullReportDate = getTimeFilterTargetDate(pool, task.rawData, baseReportDate) || "";

    return matchesRepairTimeRange(fullReportDate, filterTimeRange, dateRange);
  };
  
  // 排除终止状态后，依次应用时间筛选和多条件联合筛选
  // 排除终止状态的工单（Cancelled, Scrapped, Return_Unrepaired）
  const summaryCountTasks = tasks
    .filter(task => {
      const status = (task.status || "").toString().toLowerCase()
      // 排除终止状态
      if (status === "cancelled" || status === "scrapped" || status === "return_unrepaired") {
        return false
      }
      return true
    })
    .filter(filterTasksByTimeRange)
    .filter(task => matchesRepairListFilters(task, {
      workOrderQuery,
      customerQuery,
      deviceQuery,
      status: ALL_REPAIR_STATUS_FILTER,
    }))

  const filteredTasks = summaryCountTasks
    .filter(task => matchesRepairListFilters(task, {
      workOrderQuery: "",
      customerQuery: "",
      deviceQuery: "",
      status: filterStatus,
    }))
    .filter(task => matchesRepairSummaryFilter(task, summaryFilter))

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextUrl = buildRepairListUrl()
      const currentUrl = window.location.pathname + window.location.search
      if (nextUrl !== currentUrl) {
        router.replace(nextUrl, { scroll: false })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [buildRepairListUrl, router])

  const toggleSummaryFilter = (nextFilter: RepairSummaryFilter) => {
    const resolvedFilter = summaryFilter === nextFilter
      ? REPAIR_SUMMARY_FILTER.ALL
      : nextFilter

    setSummaryFilter(resolvedFilter)
    if (resolvedFilter !== REPAIR_SUMMARY_FILTER.ALL) {
      setFilterStatus(ALL_REPAIR_STATUS_FILTER)
    }
  }

  const handleSummaryCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    nextFilter: RepairSummaryFilter,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      toggleSummaryFilter(nextFilter)
    }
  }

  const repairFilterSignature = [
    workOrderQuery,
    customerQuery,
    deviceQuery,
    filterStatus,
    summaryFilter,
    filterTimeRange,
    dateRange.from?.getTime() ?? "",
    dateRange.to?.getTime() ?? "",
  ].join("|")
  const previousRepairFilterSignature = useRef(repairFilterSignature)

  // 联合筛选条件确实发生变化时从第一页重新展示；首次恢复 URL 状态时保留原页码。
  useEffect(() => {
    if (previousRepairFilterSignature.current !== repairFilterSignature) {
      previousRepairFilterSignature.current = repairFilterSignature
      setCurrentPage(1)
    }
  }, [repairFilterSignature])

  // 数据刷新或筛选结果减少时，把当前页约束到仍然有效的范围内。
  useEffect(() => {
    if (tasks.length > 0) {
      setCurrentPage((page) => clampPage(page, filteredTasks.length))
    }
  }, [filteredTasks.length, tasks.length])

  const paginatedTasks = paginateItems(filteredTasks, currentPage)

  if (repairsError && view === "tasks") {
    return <div role="alert" className="p-6 space-y-3"><p className="font-semibold text-destructive">工单加载失败</p><p>{repairsError}</p><Button onClick={() => void refreshRepairs()}>重新加载</Button></div>
  }

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
            <WorkOrderFilterBar
              workOrderQuery={workOrderQuery}
              customerQuery={customerQuery}
              deviceQuery={deviceQuery}
              status={filterStatus}
              statusOptions={REPAIR_STATUS_FILTER_OPTIONS}
              onWorkOrderQueryChange={setWorkOrderQuery}
              onCustomerQueryChange={setCustomerQuery}
              onDeviceQueryChange={setDeviceQuery}
              onStatusChange={(status) => {
                setSummaryFilter(REPAIR_SUMMARY_FILTER.ALL)
                setFilterStatus(status)
              }}
              trailing={(
                <>
                <select
                  aria-label="筛选时间范围"
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
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
                </>
              )}
            />

            {/* 任务统计 */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <Card
                role="button"
                tabIndex={0}
                aria-pressed={summaryFilter === REPAIR_SUMMARY_FILTER.PENDING}
                aria-label="筛选待仓库确认工单"
                onClick={() => toggleSummaryFilter(REPAIR_SUMMARY_FILTER.PENDING)}
                onKeyDown={(event) => handleSummaryCardKeyDown(event, REPAIR_SUMMARY_FILTER.PENDING)}
                className={cn(
                  "order-3 cursor-pointer select-none gap-0 border-border/50 bg-card py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-border dark:bg-card",
                  "bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/20 dark:to-primary/15",
                  summaryFilter === REPAIR_SUMMARY_FILTER.PENDING && "border-primary ring-2 ring-primary",
                )}
              >
                <CardContent className="px-3 py-3 text-center">
                  <div className="mb-1 flex items-center justify-center">
                    <Clock className="mr-2 h-4 w-4 text-primary" />
                    <p className="text-2xl font-bold leading-none text-primary md:text-3xl">{summaryCountTasks.filter(task => matchesRepairSummaryFilter(task, REPAIR_SUMMARY_FILTER.PENDING)).length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">待仓库确认</p>
                  <p className="min-h-4 text-[11px] text-primary">{summaryFilter === REPAIR_SUMMARY_FILTER.PENDING ? "已筛选，点击取消" : ""}</p>
                </CardContent>
              </Card>
              <Card
                role="button"
                tabIndex={0}
                aria-pressed={summaryFilter === REPAIR_SUMMARY_FILTER.ACTIVE}
                aria-label="筛选进行中工单"
                onClick={() => toggleSummaryFilter(REPAIR_SUMMARY_FILTER.ACTIVE)}
                onKeyDown={(event) => handleSummaryCardKeyDown(event, REPAIR_SUMMARY_FILTER.ACTIVE)}
                className={cn(
                  "order-2 cursor-pointer select-none gap-0 border-border/50 bg-card py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning dark:border-border dark:bg-card",
                  "bg-gradient-to-br from-warning/5 to-warning/10 dark:from-warning/20 dark:to-warning/15",
                  summaryFilter === REPAIR_SUMMARY_FILTER.ACTIVE && "border-warning ring-2 ring-warning",
                )}
              >
                <CardContent className="px-3 py-3 text-center">
                  <div className="mb-1 flex items-center justify-center">
                    <Wrench className="mr-2 h-4 w-4 text-warning" />
                    <p className="text-2xl font-bold leading-none text-warning md:text-3xl">{summaryCountTasks.filter(task => matchesRepairSummaryFilter(task, REPAIR_SUMMARY_FILTER.ACTIVE)).length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">进行中</p>
                  <p className="min-h-4 text-[11px] text-warning">{summaryFilter === REPAIR_SUMMARY_FILTER.ACTIVE ? "已筛选，点击取消" : ""}</p>
                </CardContent>
              </Card>
              <Card
                role="button"
                tabIndex={0}
                aria-pressed={summaryFilter === REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING}
                aria-label="筛选待商务审核或待仓库发货工单"
                onClick={() => toggleSummaryFilter(REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING)}
                onKeyDown={(event) => handleSummaryCardKeyDown(event, REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING)}
                className={cn(
                  "order-4 cursor-pointer select-none gap-0 border-border/50 bg-card py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-border dark:bg-card",
                  "bg-gradient-to-br from-violet-500/5 to-violet-500/10 dark:from-violet-500/20 dark:to-violet-500/15",
                  summaryFilter === REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING && "border-violet-500 ring-2 ring-violet-500",
                )}
              >
                <CardContent className="px-3 py-3 text-center">
                  <div className="mb-1 flex items-center justify-center">
                    <Package className="mr-2 h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <p className="text-2xl font-bold leading-none text-violet-600 md:text-3xl dark:text-violet-400">{summaryCountTasks.filter(task => matchesRepairSummaryFilter(task, REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING)).length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">待商务审核 / 待仓库发货</p>
                  <p className="min-h-4 text-[11px] text-violet-600 dark:text-violet-400">{summaryFilter === REPAIR_SUMMARY_FILTER.BUSINESS_AND_SHIPPING ? "已筛选，点击取消" : ""}</p>
                </CardContent>
              </Card>
              <Card
                role="button"
                tabIndex={0}
                aria-pressed={summaryFilter === REPAIR_SUMMARY_FILTER.COMPLETED}
                aria-label="筛选已完成工单"
                onClick={() => toggleSummaryFilter(REPAIR_SUMMARY_FILTER.COMPLETED)}
                onKeyDown={(event) => handleSummaryCardKeyDown(event, REPAIR_SUMMARY_FILTER.COMPLETED)}
                className={cn(
                  "order-1 cursor-pointer select-none gap-0 border-border/50 bg-card py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success dark:border-border dark:bg-card",
                  "bg-gradient-to-br from-success/5 to-success/10 dark:from-success/20 dark:to-success/15",
                  summaryFilter === REPAIR_SUMMARY_FILTER.COMPLETED && "border-success ring-2 ring-success",
                )}
              >
                <CardContent className="px-3 py-3 text-center">
                  <div className="mb-1 flex items-center justify-center">
                    <CheckCircle className="mr-2 h-4 w-4 text-success" />
                    <p className="text-2xl font-bold leading-none text-success md:text-3xl">{summaryCountTasks.filter(task => matchesRepairSummaryFilter(task, REPAIR_SUMMARY_FILTER.COMPLETED)).length}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">已完成</p>
                  <p className="min-h-4 text-[11px] text-success">{summaryFilter === REPAIR_SUMMARY_FILTER.COMPLETED ? "已筛选，点击取消" : ""}</p>
                </CardContent>
              </Card>
            </div>

            {/* 任务列表 —— 紧凑列表模式 */}
            <Card className="overflow-visible border-0 bg-transparent py-0 shadow-none">
              {filteredTasks.length > 0 ? (
                <>
                  <WorkOrderCardStack>
                    {paginatedTasks.map((task) => {
                    const unread = task.isBatch ? getUnreadCount(task.batchId, task.rawData?.messageCount || 0) : 0
                    const isTerminal = isTerminalStatus(task.status)
                    const needsSupplement = !isTerminal && (
                      !task.productSN ||
                      (typeof task.productSN === 'string' && task.productSN.trim() === "") ||
                      (typeof task.productSN === 'string' && task.productSN.toUpperCase() === "PENDING") ||
                      (typeof task.deviceSerialNumber === 'string' && task.deviceSerialNumber?.toUpperCase() === "PENDING")
                    )

                    return (
                      <WorkOrderListRow
                        key={task.id}
                        title={task.isBatch ? `工单号：${task.batchId}` : `工单号：${task.workOrderNumber || task.id}`}
                        isBatch={task.isBatch}
                        projectName={task.projectName || task.projectLocation}
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
                        inWarranty={task.inWarranty}
                        priorityIndicator={getPriorityIndicator(task.priority)}
                        statusNode={getStatusBadge(task.status)}
                        reportedAt={task.reportedAt}
                        unreadCount={unread}
                        hasSignedPhoto={task.isBatch && !!task.rawData?.signedReportPhoto}
                        pendingSnText={needsSupplement ? "待补录 SN" : undefined}
                        onClick={() => {
                          // 只要有批次ID（不管是批次工单还是批次中的单个设备），都跳转到批次详情页
                          // 与首页仪表盘保持一致，展示统一的工单详情页（阶段进度条、设备列表、盖章件、打印等）
                          // 携带 from=repair，方便详情页"返回"时能回到维修工单列表而不是首页
                          if (task.batchId) {
                            const returnTo = encodeURIComponent(buildRepairListUrl())
                            router.push(`/batch/${task.batchId}?from=repair&returnTo=${returnTo}`);
                          } else {
                            handleViewTask(task.id);
                          }
                        }}
                      />
                    )
                    })}
                  </WorkOrderCardStack>
                  <WorkOrderPagination
                    currentPage={currentPage}
                    totalItems={filteredTasks.length}
                    onPageChange={setCurrentPage}
                  />
                </>
              ) : (
                <CardContent className="rounded-xl border border-border/50 bg-card p-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">暂无维修任务</p>
                  <p className="text-xs text-muted-foreground mt-1">请点击"新建维修"按钮添加维修任务</p>
                </CardContent>
              )}
            </Card>
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

      {view === "batchSelect" && activeBatchContext && (
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
                工单号：{activeBatchContext.batchId}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                共 {sumDeviceQuantity(activeBatchContext.devices)} 台设备
              </p>
            </div>
          </div>

          {activeBatchContext.devices.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {activeBatchContext.devices.map((device: BatchDevice, idx: number) => {
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
                        {getStatusBadge(device.status || TicketStatus.CREATED)}
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
                  ticketId={activeBatchContext.batchId}
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
                      } else if (log.type === OperationLogType.BUSINESS_REVIEW_SKIPPED) {
                        IconComponent = CheckCircle
                        iconColor = "text-slate-600"
                        bgColor = "bg-slate-100"
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
                                {format(toBeijingTime(log.time), "MM-dd HH:mm", { locale: zhCN })}
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
