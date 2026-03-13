"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Clock, Wrench, AlertCircle, ChevronRight, Filter, Search, Plus, ArrowLeft, ShieldCheck, ShieldAlert, Calendar, CheckCircle, FileCheck, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { RepairStatusTimeline } from "@/components/repair-status-timeline"
import { format, isAfter, isBefore, parseISO, subDays, subMonths } from "date-fns"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import RepairForm from "@/components/repair-form"
import { useRepairContext } from "@/context/RepairContext"
import { UserRole, isTerminalStatus, TicketStatus } from "@/lib/enums"
import { 
  AggregatedStatus, 
  getAggregatedStatus, 
  countByAggregatedStatus,
  AGGREGATED_STATUS_CONFIG,
  getBatchAggregatedStatus
} from "@/lib/workflow-utils"

export default function ReportPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [userRealName, setUserRealName] = useState<string>("")
  const [userName, setUserName] = useState<string>("")
  
  // 从 user context 获取用户信息（不再使用 localStorage）
  useEffect(() => {
    setUserRealName(user?.realName || "");
    setUserName(user?.id || "");
  }, [user]);
  
  // 使用RepairContext获取维修工单数据
  const { repairs } = useRepairContext();
  
  // 视图状态：tasks(任务列表), new(新建维修)
  const [view, setView] = useState<"tasks" | "new">("tasks")
  
  // 当页面加载时，确保显示任务列表
  useEffect(() => {
    setView("tasks")
  }, [])
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
  const [loadingTasks, setLoadingTasks] = useState(true)
  
  // 从数据库 API 加载工单数据
  useEffect(() => {
    const loadTickets = async () => {
      if (view !== "tasks") return; // 只在任务列表视图时加载
      
      setLoadingTasks(true)
      try {
        // 获取当前用户ID（从 user context 获取，不再使用 localStorage）
        const userId = user?.id || null
        
        // 从 API 获取所有工单
        const response = await fetch('/api/tickets')
        
        if (!response.ok) {
          throw new Error(`获取工单列表失败 (HTTP ${response.status})`)
        }
        
        const result = await response.json()
        
        if (result.success) {
          // 确保 data 是数组（即使为空）
          const ticketsData = Array.isArray(result.data) ? result.data : []
          
          if (ticketsData.length > 0) {
            console.log('从API获取到的工单数量:', ticketsData.length)
            console.log('当前用户ID:', userId)
            console.log('当前用户角色:', user?.role)
            // 根据用户角色过滤工单
            let userTickets = ticketsData
            if (userId && user?.role) {
              // Reporter(现场人员)只能看到自己创建的工单
              if (user.role === UserRole.REPORTER) {
                const userIdStr = String(userId)
                userTickets = ticketsData.filter((ticket: any) => {
                  if (ticket.reportedByUserId) {
                    return String(ticket.reportedByUserId) === userIdStr
                  }
                  const reportedByStr = ticket.reportedBy ? String(ticket.reportedBy) : ""
                  return reportedByStr === userIdStr
                })
              }
            } else {
              userTickets = ticketsData
            }
            
            console.log('过滤后的工单数量:', userTickets.length)
          
          // 转换为组件需要的格式（排除已删除的工单）
          // ⚠️ 保留原始 ticket.status（DB枚举值），不做简化映射
          //    getAggregatedStatus() 负责在展示/筛选时转换，getBatchAggregatedStatus() 也需要原始值
          const formattedTasks = userTickets
            .filter((ticket: any) => (ticket.status || "").toLowerCase() !== "deleted")
            .map((ticket: any) => {
              return {
                id: ticket.id,
                batchId: ticket.batchId || null,
                workOrderNumber: ticket.workOrderNumber || "",
                deviceId: ticket.deviceSerialNumber || "",
                deviceName: ticket.deviceName || ticket.deviceModel || "未知设备",
                deviceSerialNumber: ticket.deviceSerialNumber || "",
                productSN: ticket.productSN || ticket.deviceSerialNumber || "",
                location: ticket.projectLocation || "",
                fault: ticket.problem || "",
                status: ticket.status || "Pending",  // ← 保留原始 DB 状态
                priority: "medium" as const,
                reportedAt: ticket.reportedAt ? format(new Date(ticket.reportedAt), "yyyy-MM-dd HH:mm") : "",
                inWarranty: undefined,
                warrantyEnd: undefined,
                reportedBy: ticket.reportedBy || "",
                expectedCompletionDate: ticket.expectedCompletionDate || null,
                delayReason: ticket.delayReason || null,
                contactInfo: ticket.contactInfo || "",
                senderAddress: ticket.senderAddress || "",
                customerName: ticket.customerName || "",
                courierCompany: ticket.courierCompany || "",
                trackingNumber: ticket.trackingNumber || "",
              }
            })
          
          // 按批次分组：如果有 batchId，同一批次的工单合并为一个批次工单
          const groupedTasks: any[] = []
          const batchMap = new Map<string, any[]>()
          
          console.log('📊 开始批次分组，总工单数:', formattedTasks.length)
          
          formattedTasks.forEach((task: any, taskIdx: number) => {
            // 确保每个 task 都有有效的 id
            if (!task.id || task.id.trim() === "") {
              task.id = `task-fallback-${taskIdx}-${task.deviceSerialNumber || Date.now()}`
              console.warn('工单缺少有效ID，使用后备ID:', task.id, task)
            }
            
            console.log(`📌 工单 ${taskIdx}: id=${task.id}, batchId=${task.batchId}, deviceSN=${task.deviceSerialNumber}`)
            
            // 检查 batchId 是否有效（非空且非空字符串）
            if (task.batchId && task.batchId.trim() !== "") {
              // 有批次ID，分组
              console.log(`✅ 工单 ${task.id} 有批次ID: ${task.batchId}，加入批次`)
              if (!batchMap.has(task.batchId)) {
                batchMap.set(task.batchId, [])
              }
              batchMap.get(task.batchId)!.push(task)
            } else {
              // 没有批次ID，单独显示
              console.log(`❌ 工单 ${task.id} 没有批次ID，单独显示`)
              groupedTasks.push(task)
            }
          })
          
          console.log('📦 批次Map大小:', batchMap.size)
          console.log('📦 批次Map内容:', Array.from(batchMap.entries()).map(([id, tasks]) => ({ id, count: tasks.length })))
          
          // 将批次工单添加到列表（每个批次显示为一个工单）
          batchMap.forEach((batchTasks, batchId) => {
            console.log('🔧 处理批次:', batchId, '设备数量:', batchTasks.length)
            if (batchTasks.length > 0 && batchId && batchId.trim() !== "") {
              // 使用批次中第一个工单的信息作为批次工单的主信息
              const firstTask = batchTasks[0]
              
              // 🎯 计算批次的聚合状态：使用进度最高的设备状态
              const batchStatus = getBatchAggregatedStatus(batchTasks)
              
              console.log(`📊 批次 ${batchId} 状态聚合: ${firstTask.status} -> ${batchStatus}`)
              
              // 解析联系人信息（格式：姓名 电话）
              const contactParts = (firstTask.contactInfo || "").split(" ")
              const contactPerson = contactParts[0] || ""
              const contactPhone = contactParts[1] || ""
              
              const batchTaskId = batchId && batchId.trim() !== "" ? batchId : `batch-${Date.now()}-${Math.random()}`
              console.log('创建批次工单，ID:', batchTaskId)
              
              groupedTasks.push({
                ...firstTask,
                id: batchTaskId, // 使用 batchId 作为 key（已确保非空）
                status: batchStatus, // ✅ 使用聚合后的最高状态，而不是第一个设备的状态
                isBatch: true, // 标记为批次工单
                deviceCount: batchTasks.length, // 设备数量
                devices: batchTasks, // 批次中的所有设备
                // 修改显示内容：显示客户信息而不是设备信息
                projectName: firstTask.location, // 项目名称
                contactPerson: contactPerson, // 联系人姓名
                contactPhone: contactPhone, // 联系电话
                deviceSerialNumber: `${batchTasks.length}个设备`, // 显示设备数量
                fault: firstTask.fault || "维修工单", // 使用第一个设备的故障描述
              })
            }
          })
          
          console.log('最终分组的工单列表:', groupedTasks)
          console.log('工单数量:', groupedTasks.length)
          setTasks(groupedTasks)
          } else {
            // 数据库中没有工单
            setTasks([])
          }
        } else {
          // API 返回失败
          setTasks([])
        }
      } catch (error: any) {
        setTasks([])
      } finally {
        setLoadingTasks(false)
      }
    }
    
    // 确保在组件挂载时加载数据
    if (view === "tasks") {
      loadTickets()
    }
  }, [view, user?.id]) // 当视图或用户ID变化时重新加载

  // 流程步骤定义（用于卡片底部的迷你流程指示器）
  // 正确顺序：待接单 → 检测中（仓库填出厂日期） → 待签字 → 维修中 → 待审核 → 待发货 → 已完成
  const REPORTER_STEPS = [
    { status: AggregatedStatus.PENDING_RECEIVE,  label: "待接单" },
    { status: AggregatedStatus.INSPECTING,       label: "检测中" },
    { status: AggregatedStatus.PENDING_SIGNATURE,label: "待签字" },
    { status: AggregatedStatus.IN_REPAIR,        label: "维修中" },
    { status: AggregatedStatus.PENDING_REVIEW,   label: "待审核" },
    { status: AggregatedStatus.PENDING_SHIPPING, label: "待发货" },
    { status: AggregatedStatus.COMPLETED,        label: "已完成" },
  ]

  const getMiniStepFlow = (status: string) => {
    const currentAgg = getAggregatedStatus(status)
    const currentIdx = REPORTER_STEPS.findIndex(s => s.status === currentAgg)
    return (
      <div className="flex items-center gap-0.5 flex-wrap">
        {REPORTER_STEPS.map((step, idx) => {
          const isCurrent = idx === currentIdx
          const isPast    = idx < currentIdx
          return (
            <div key={step.status} className="flex items-center">
              <span className={
                isCurrent
                  ? "text-[11px] font-semibold text-foreground"
                  : isPast
                    ? "text-[11px] text-muted-foreground/40 line-through"
                    : "text-[11px] text-muted-foreground/40"
              }>
                {step.label}
              </span>
              {idx < REPORTER_STEPS.length - 1 && (
                <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 mx-0.5 shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    )
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

  const handleNewRepair = () => {
    setView("new")
  }

  const handleBackToTasks = () => {
    setView("tasks")
  }

  // 根据时间范围过滤任务
  const filterTasksByTimeRange = (task: any) => {
    if (filterTimeRange === "all") return true;
    
    // 获取完整的reportedAt日期字符串，而不是只取时间部分
    const taskReportedAt = task?.reportedAt || "";
    const fullReportDate = taskReportedAt && taskReportedAt.includes(" ") ? 
      taskReportedAt : 
      (repairs && Array.isArray(repairs) ? repairs.find(r => r && r.id === task?.id)?.reportedAt : null) || taskReportedAt || "";
    
    if (!fullReportDate) return true;
    
    // 解析日期字符串为Date对象
    let taskDate: Date;
    try {
      taskDate = parseISO(fullReportDate.split(" ")[0]);
    } catch {
      return true;
    }
    const today = new Date();
    
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
  
  // 计算聚合状态统计
  const statusCounts = countByAggregatedStatus(tasks);
  
  // 先按状态筛选，再按时间筛选，最后按搜索关键词筛选
  const filteredTasks = (Array.isArray(tasks) ? tasks : [])
    .filter(task => {
      if (!task) return false;
      if (filterStatus === "all") return true;
      // 使用聚合状态进行筛选
      const taskAggregatedStatus = getAggregatedStatus(task.status);
      return taskAggregatedStatus === filterStatus;
    })
    .filter(filterTasksByTimeRange)
    .filter(task => {
      if (!task) return false;
      if (searchQuery === "") return true;
      const query = searchQuery.toLowerCase();
      return (
        (task.workOrderNumber || "").toLowerCase().includes(query) || 
        (task.deviceSerialNumber || "").toLowerCase().includes(query) ||
        (task.fault || "").toLowerCase().includes(query)
      );
    })

  return (
    <>
      {view === "tasks" && (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-background via-background to-primary/5 dark:from-background dark:via-background dark:to-primary/10 min-h-screen">
          {loadingTasks ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">加载工单中...</p>
              </div>
            </div>
          ) : (
            <>
          <div className="flex items-center justify-between pb-4 border-b border-border/50">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">深圳市爱克信智能股份有限公司</h1>
              <p className="text-sm text-muted-foreground mt-1">智能门禁设备维修管理系统</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleNewRepair} className="shadow-md hover:shadow-lg transition-all">
                <Plus className="w-4 h-4 mr-2" />
                新建维修
              </Button>
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
              
              {/* 如果有筛选，显示清除按钮 */}
              {filterStatus !== "all" && (
                <Button 
                  variant="outline" 
                  onClick={() => setFilterStatus("all")}
                  className="shrink-0"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  查看全部
                </Button>
              )}
              
              {/* 状态筛选 */}
              <div className="flex gap-2">
                <select 
                  className="px-3 py-2 rounded-md border border-border bg-background text-sm"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">全部状态</option>
                  <option value={AggregatedStatus.PENDING_RECEIVE}>待接单</option>
                  <option value={AggregatedStatus.INSPECTING}>检测中</option>
                  <option value={AggregatedStatus.PENDING_SIGNATURE}>待签字</option>
                  <option value={AggregatedStatus.IN_REPAIR}>维修中</option>
                  <option value={AggregatedStatus.PENDING_REVIEW}>待审核</option>
                  <option value={AggregatedStatus.PENDING_SHIPPING}>待发货</option>
                  <option value={AggregatedStatus.COMPLETED}>已完成</option>
                  <option value={AggregatedStatus.ABNORMAL}>异常</option>
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

            {/* 任务列表 */}
            <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task, taskIndex) => {
                  // 确保 key 永远不为空
                  const taskKey = (task.id && typeof task.id === 'string' && task.id.trim() !== "") 
                    ? task.id 
                    : `task-${taskIndex}-${task.deviceSerialNumber || task.batchId || Date.now()}`
                  
                  // 计算当前聚合状态，用于决定卡片样式和按钮
                  const aggStatus = getAggregatedStatus(task.status)
                  const needsSignature = task.isBatch && aggStatus === AggregatedStatus.PENDING_SIGNATURE

                  return (
                  <Card
                    key={taskKey}
                    className="border-border/50 dark:border-border hover:border-primary/50 dark:hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer active:scale-[0.98] bg-card/50 dark:bg-card backdrop-blur-sm"
                    onClick={() => {
                      if (task.isBatch) {
                        router.push(`/report/batch/${task.batchId}`)
                      } else {
                        router.push(`/report/detail/${task.id}`)
                      }
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {getPriorityIndicator(task.priority)}
                          <h3 className="font-semibold text-foreground truncate text-base">
                            {task.isBatch ? `工单号：${task.batchId}` : `序列号：${task.deviceSerialNumber}`}
                          </h3>
                          {task.isBatch && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              多设备 ({task.deviceCount}台)
                            </Badge>
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
                        {task.isBatch ? (
                          <>
                            <div className="space-y-2 mb-2">
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <span className="font-medium">项目名称:</span> {task.projectName || task.location || "未填写"}
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <span className="font-medium">联系人:</span> {task.contactPerson || "未填写"}
                                {task.contactPhone && <span className="text-xs">({task.contactPhone})</span>}
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <span className="font-medium">设备数量:</span> 
                                <Badge variant="secondary" className="text-xs">{task.deviceCount}个设备</Badge>
                              </p>
                            </div>
                            {/* 按钮区：待签字时显示醒目的上传按钮，其他状态显示查看报告 */}
                            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                              {needsSignature ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/report/batch/${task.batchId}`);
                                    }}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    上传签字凭证
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/repairs/print/${task.batchId}`);
                                    }}
                                  >
                                    <FileCheck className="w-3 h-3 mr-1" />
                                    先查看维修报告
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/repairs/print/${task.batchId}`);
                                  }}
                                >
                                  查看维修报告
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground mb-2 truncate flex items-center gap-1">
                            <span className="font-medium">序列号:</span> {task.deviceSerialNumber || "未知"}
                          </p>
                        )}
                        {!task.isBatch && (
                          <div className="flex items-start gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground dark:text-muted-foreground mt-0.5 shrink-0" />
                            <span className="text-muted-foreground dark:text-muted-foreground line-clamp-2">
                              {task.fault}
                            </span>
                          </div>
                        )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{task.reportedAt}</span>
                          {task.expectedCompletionDate && getAggregatedStatus(task.status) === AggregatedStatus.ABNORMAL && (
                            <span className="text-[11px] text-amber-400 whitespace-nowrap">
                              延期至 {format(new Date(task.expectedCompletionDate), "yyyy-MM-dd")}
                            </span>
                          )}
                          {/* 待补录 SN 提示 - 最终维修状态下不显示 */}
                          {(() => {
                            // 特殊情况：最终维修状态下，序列号可以为空，不显示"待补录"
                            const isTerminal = isTerminalStatus(task.status)
                            const needsSupplement = !isTerminal && (
                              !task.productSN || 
                              task.productSN.trim() === "" || 
                              task.productSN.toUpperCase() === "PENDING" ||
                              task.deviceSerialNumber?.toUpperCase() === "PENDING"
                            )
                            return needsSupplement ? (
                              <span className="text-[11px] text-warning whitespace-nowrap">
                                待补录 SN
                              </span>
                            ) : null
                          })()}
                        </div>
                      </div>
                      {/* 迷你流程步骤指示器 */}
                      {task.isBatch && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          {getMiniStepFlow(task.status)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  )
                }))
              : (
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
          </>
          )}
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
    </>
  )
}