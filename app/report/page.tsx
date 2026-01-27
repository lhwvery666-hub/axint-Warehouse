"use client"

import { useState, useEffect } from "react"
import { Clock, Wrench, AlertCircle, ChevronRight, Filter, Search, Plus, ArrowLeft, ShieldCheck, ShieldAlert, Calendar, CheckCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { format, isAfter, isBefore, parseISO, subDays, subMonths } from "date-fns"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import RepairForm from "@/components/repair-form"
import RepairDetail from "@/components/repair-detail"
import { useRepairContext } from "@/context/RepairContext"

export default function ReportPage() {
  const { user } = useAuth()
  const [userRealName, setUserRealName] = useState<string>("")
  const [userName, setUserName] = useState<string>("")
  
  // 从 user context 获取用户信息（不再使用 localStorage）
  useEffect(() => {
    setUserRealName(user?.realName || "");
    setUserName(user?.id || "");
  }, [user]);
  
  // 使用RepairContext获取维修工单数据
  const { repairs } = useRepairContext();
  
  // 弹窗状态
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  
  // 视图状态：tasks(任务列表), new(新建维修), detail(维修详情)
  const [view, setView] = useState<"tasks" | "new" | "detail">("tasks")
  
  // 当页面加载时，确保显示任务列表
  useEffect(() => {
    setView("tasks")
  }, [])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
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
            // 如果有用户ID，过滤只属于当前用户的工单
            let userTickets = ticketsData
            if (userId) {
              // 使用 reportedByUserId 来过滤（如果存在），否则回退到 reportedBy 比较
              const userIdStr = String(userId)
              userTickets = ticketsData.filter((ticket: any) => {
                // 优先使用 reportedByUserId（用户ID）
                if (ticket.reportedByUserId) {
                  return String(ticket.reportedByUserId) === userIdStr
                }
                // 如果没有 reportedByUserId，回退到 reportedBy 比较（兼容旧数据）
                const reportedByStr = ticket.reportedBy ? String(ticket.reportedBy) : ""
                return reportedByStr === userIdStr
              })
            } else {
              // 如果用户ID为空，显示所有工单
              userTickets = ticketsData
            }
          
          // 转换为组件需要的格式（排除已删除的工单）
          const formattedTasks = userTickets
            .filter((ticket: any) => (ticket.status || "").toLowerCase() !== "deleted")
            .map((ticket: any) => {
              // 状态映射：数据库状态转为小写
              const dbStatus = (ticket.status || "Pending").toLowerCase()
              const mappedStatus = dbStatus === "pending" ? "pending" :
                                  dbStatus === "processing" ? "processing" :
                                  dbStatus === "completed" ? "completed" :
                                  dbStatus === "unrepairable" ? "unrepairable" :
                                  dbStatus === "delayed" ? "delayed" : "pending"
              
              return {
                id: ticket.id,
                deviceId: ticket.deviceSerialNumber || "",
                deviceName: ticket.deviceName || ticket.deviceModel || "未知设备", // 优先使用设备名称
                deviceSerialNumber: ticket.deviceSerialNumber || "",
                productSN: ticket.productSN || ticket.deviceSerialNumber || "", // ProductSN 字段
                location: ticket.projectLocation || "",
                fault: ticket.problem || "",
                status: mappedStatus,
                priority: "medium" as const,
                reportedAt: ticket.reportedAt ? format(new Date(ticket.reportedAt), "yyyy-MM-dd HH:mm") : "",
                inWarranty: undefined,
                warrantyEnd: undefined,
                reportedBy: ticket.reportedBy || "",
                expectedCompletionDate: ticket.expectedCompletionDate || null,
                delayReason: ticket.delayReason || null,
              }
            })
          
          setTasks(formattedTasks)
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

  const getStatusBadge = (status: "pending" | "processing" | "completed" | "unrepairable" | "delayed") => {
    if (status === "pending") {
      return (
        <Badge className="bg-warning/15 text-warning-foreground border-warning/30 hover:bg-warning/20">
          <Clock className="w-3 h-3 mr-1" />
          待处理
        </Badge>
      )
    } else if (status === "processing") {
      return (
        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
          <Wrench className="w-3 h-3 mr-1" />
          处理中
        </Badge>
      )
    } else if (status === "completed") {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          已完成
        </Badge>
      )
    } else if (status === "unrepairable") {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          无法维修
        </Badge>
      )
    } else if (status === "delayed") {
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
  
  // 先按状态筛选，再按时间筛选，最后按搜索关键词筛选
  const filteredTasks = (Array.isArray(tasks) ? tasks : [])
    .filter(task => task && (
      filterStatus === "all" || 
      task.status === filterStatus
    ))
    .filter(filterTasksByTimeRange)
    .filter(task => {
      if (!task) return false;
      if (searchQuery === "") return true;
      const query = searchQuery.toLowerCase();
      return (
        (task.deviceName || "").toLowerCase().includes(query) || 
        (task.location || "").toLowerCase().includes(query) ||
        (task.fault || "").toLowerCase().includes(query) ||
        (task.deviceSerialNumber || "").toLowerCase().includes(query)
      );
    })

  return (
    <>
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
                  setSelectedTaskId(selectedTask.id);
                  setView("detail");
                }} className="flex-1">
                  查看详情
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
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
              
              {/* 状态筛选 */}
              <div className="flex gap-2">
                <select 
                  className="px-3 py-2 rounded-md border border-border bg-background text-sm"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">全部状态</option>
                  <option value="pending">待处理</option>
                  <option value="processing">处理中</option>
                  <option value="completed">已完成</option>
                  <option value="unrepairable">无法维修</option>
                  <option value="delayed">已延期</option>
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
                    <p className="text-3xl md:text-4xl font-bold text-primary">
                      {Array.isArray(tasks) ? tasks.filter(t => t && t.status === "pending").length : 0}
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
                      {Array.isArray(tasks) ? tasks.filter(t => t && t.status === "processing").length : 0}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">进行中</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-success/5 to-success/10 dark:from-success/20 dark:to-success/15 bg-card dark:bg-card">
                <CardContent className="p-4 md:p-6 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <CheckCircle className="h-5 w-5 text-success mr-2" />
                    <p className="text-3xl md:text-4xl font-bold text-success">
                      {Array.isArray(tasks) ? tasks.filter(t => t && t.status === "completed").length : 0}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">已完成</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-destructive/5 to-destructive/10 dark:from-destructive/20 dark:to-destructive/15 bg-card dark:bg-card">
                <CardContent className="p-4 md:p-6 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <AlertCircle className="h-5 w-5 text-destructive mr-2" />
                    <p className="text-3xl md:text-4xl font-bold text-destructive">
                      {Array.isArray(tasks) ? tasks.filter(t => t && t.status === "unrepairable").length : 0}
                    </p>
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
                      // 显示弹窗
                      setSelectedTask(task);
                      setIsDialogOpen(true);
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {getPriorityIndicator(task.priority)}
                          <h3 className="font-semibold text-foreground truncate text-base">{task.deviceName}</h3>
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
                        <p className="text-sm text-muted-foreground mb-2 truncate flex items-center gap-1">
                          <span className="font-medium">序列号:</span> {task.deviceSerialNumber || "未知"}
                        </p>
                        <p className="text-sm text-muted-foreground mb-3 truncate flex items-center gap-1">
                          <span className="text-xs">📍</span>
                          <span className="font-medium">位置:</span> {task.location}
                        </p>
                        <div className="flex items-start gap-2 text-sm bg-muted/30 dark:bg-muted/50 rounded-md p-2">
                          <AlertCircle className="w-4 h-4 text-muted-foreground dark:text-muted-foreground mt-0.5 shrink-0" />
                          <span className="text-muted-foreground dark:text-muted-foreground line-clamp-2">{task.fault}</span>
                        </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {getStatusBadge(task.status)}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{task.reportedAt}</span>
                          {task.status === "delayed" && task.expectedCompletionDate && (
                            <span className="text-[11px] text-amber-400 whitespace-nowrap">
                              延期至 {format(new Date(task.expectedCompletionDate), "yyyy-MM-dd")}
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

      {view === "detail" && selectedTaskId && (
        <RepairDetail taskId={selectedTaskId} onBack={handleBackToTasks} />
      )}
    </>
  )
}