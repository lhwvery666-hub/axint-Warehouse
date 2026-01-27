"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronRight, Settings, Bell, FileText, HelpCircle, LogOut, Wrench, CheckCircle, Clock, Users, Camera, Pencil, Check, Loader2, Mail, Phone, MessageSquare, Info, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import { useRepairContext } from "@/context/RepairContext"
import { useNotificationContext } from "@/context/NotificationContext"
import { useTheme } from "next-themes"

const menuItems = [
  { icon: FileText, label: "我的报告", badge: "" },
  { icon: Bell, label: "通知中心", badge: "" },
  { icon: Settings, label: "设置" },
  { icon: HelpCircle, label: "帮助中心" },
]

export default function ReporterProfile() {
  const { user, logout } = useAuth()
  const { repairs } = useRepairContext()
  const { notifications, unreadCount, getNotificationsByRecipient, markAsRead, markAllAsRead } = useNotificationContext()
  const { theme, setTheme } = useTheme()
  const [userRepairs, setUserRepairs] = useState<any[]>([])
  const [recentRepairs, setRecentRepairs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // 获取当前用户的通知
  const [userNotifications, setUserNotifications] = useState<any[]>([])
  
  useEffect(() => {
    if (user?.realName) {
      const notifications = getNotificationsByRecipient(user.realName)
      setUserNotifications(notifications)
    }
  }, [notifications, getNotificationsByRecipient, user])
  const [isEditing, setIsEditing] = useState(false)
  const [editedUser, setEditedUser] = useState({
    realName: "",
    phone: "",
    avatar: ""
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  
  // 对话框状态
  const [openDialog, setOpenDialog] = useState<string | null>(null)
  
  // 设置状态
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [emailNotifications, setEmailNotifications] = useState(false)
  
  // 从主题获取深色模式状态
  const isDarkMode = theme === "dark"
  
  useEffect(() => {
    if (user) {
      setEditedUser({
        realName: user.realName || "",
        phone: user.phone || "",
        avatar: user.avatar || "/placeholder-user.jpg"
      })
    }
  }, [user])
  
  useEffect(() => {
    // 过滤出当前用户提交的维修工单
    if (user) {
      const filteredRepairs = repairs.filter(repair => 
        repair.reportedBy === user.realName || repair.reportedBy === user.id
      )
      
      setUserRepairs(filteredRepairs)
      
      // 获取最近的5个维修工单
      const recent = [...filteredRepairs]
        .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
        .slice(0, 5)
      
      setRecentRepairs(recent)
    }
  }, [repairs])
  
  // 计算统计数据
  const totalRepairs = userRepairs.length
  const pendingRepairs = userRepairs.filter(r => r.status === "pending").length
  const processingRepairs = userRepairs.filter(r => r.status === "processing").length
  const completedRepairs = userRepairs.filter(r => r.status === "completed").length
  const unrepairableRepairs = userRepairs.filter(r => r.status === "unrepairable").length

  const handleLogout = () => {
    setIsLoading(true);
    setTimeout(() => {
      logout();
      setIsLoading(false);
    }, 1000);
  };

  const handleEditToggle = async () => {
    if (isEditing) {
      // 保存更改到数据库（通过 API）
      try {
        // TODO: 调用 API 更新用户信息
        // await fetch(`/api/users/${user?.id}`, { method: 'PUT', ... })
        console.log('保存用户信息:', editedUser)
      } catch (error) {
        console.error('保存用户信息失败:', error)
      }
      setTimeout(() => {
        setIsEditing(false);
        alert("个人信息已更新");
      }, 500);
    } else {
      setIsEditing(true);
    }
  };

  const handleAvatarClick = () => {
    if (isEditing && avatarInputRef.current) {
      avatarInputRef.current.click();
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      // 创建临时URL用于预览
      const imageUrl = URL.createObjectURL(file);
      setEditedUser(prev => ({ ...prev, avatar: imageUrl }));
    }
  };
  
  // 获取状态标签
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-warning/15 text-warning-foreground border-warning/30">待处理</Badge>
      case "processing":
        return <Badge className="bg-primary/15 text-primary border-primary/30">处理中</Badge>
      case "completed":
        return <Badge className="bg-success/15 text-success border-success/30">已完成</Badge>
      case "unrepairable":
        return <Badge className="bg-red-100 text-red-800 border-red-300">无法维修</Badge>
      default:
        return null
    }
  }
  
  const handleMenuClick = (label: string) => {
    setOpenDialog(label)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-background via-background to-primary/5 dark:from-background dark:via-background dark:to-primary/10 min-h-screen">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          {/* Profile Header */}
          <Card className="border-border/50 dark:border-border overflow-hidden shadow-lg bg-card dark:bg-card">
            <CardHeader className="bg-primary/5 dark:bg-primary/20 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">个人信息</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleEditToggle}
                className="h-8 px-2 text-primary"
              >
                {isEditing ? (
                  <span className="flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    保存
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Pencil className="h-4 w-4" />
                    编辑
                  </span>
                )}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-primary/10 dark:bg-primary/20 px-5 py-8">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar 
                      className={cn("w-16 h-16", isEditing && "cursor-pointer hover:opacity-80")} 
                      onClick={handleAvatarClick}
                    >
                      <AvatarImage src={editedUser.avatar} alt="用户头像" />
                      <AvatarFallback>
                        {editedUser.realName?.substring(0, 2) || "用户"}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1">
                        <Camera className="h-3 w-3" />
                        <input
                          type="file"
                          ref={avatarInputRef}
                          onChange={handleAvatarChange}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input 
                          value={editedUser.realName}
                          onChange={(e) => setEditedUser(prev => ({ ...prev, realName: e.target.value }))}
                          placeholder="请输入您的真实姓名"
                          className="h-8 text-sm"
                        />
                        <Input 
                          value={editedUser.phone}
                          onChange={(e) => setEditedUser(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="请输入您的手机号"
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : (
                      <>
                        <h2 className="text-lg font-semibold text-foreground">{editedUser.realName || "未设置实名"}</h2>
                        <p className="text-sm text-muted-foreground">现场报告人员</p>
                        <p className="text-xs text-muted-foreground mt-1">联系电话: {editedUser.phone || "未设置"}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border py-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-primary">{totalRepairs}</p>
                  <p className="text-xs text-muted-foreground">总报修数</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-success">{completedRepairs}</p>
                  <p className="text-xs text-muted-foreground">已完成</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-warning">{pendingRepairs + processingRepairs}</p>
                  <p className="text-xs text-muted-foreground">处理中</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logout Button */}
          <Button
            variant="outline"
            className="w-full h-12 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive bg-transparent"
            onClick={handleLogout}
            disabled={isLoading || isEditing}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                退出中...
              </span>
            ) : (
              <>
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </>
            )}
          </Button>

          {/* Version Info */}
          <p className="text-center text-xs text-muted-foreground">Version 1.0.0</p>
        </div>

        <div className="md:col-span-2 space-y-6">
          {/* Repair Statistics */}
          <div>
            <h2 className="text-xl font-semibold mb-4">维修统计</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-card dark:bg-card">
                <CardContent className="p-4 flex flex-col items-center justify-center">
                  <div className="rounded-full bg-primary/10 dark:bg-primary/20 p-3 mb-2">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">{totalRepairs}</p>
                  <p className="text-sm text-muted-foreground">总报修数</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-card dark:bg-card">
                <CardContent className="p-4 flex flex-col items-center justify-center">
                  <div className="rounded-full bg-warning/10 dark:bg-warning/20 p-3 mb-2">
                    <Clock className="w-5 h-5 text-warning" />
                  </div>
                  <p className="text-2xl font-bold">{pendingRepairs}</p>
                  <p className="text-sm text-muted-foreground">待处理</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-card dark:bg-card">
                <CardContent className="p-4 flex flex-col items-center justify-center">
                  <div className="rounded-full bg-blue-100 dark:bg-blue-500/20 p-3 mb-2">
                    <Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-2xl font-bold">{processingRepairs}</p>
                  <p className="text-sm text-muted-foreground">处理中</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 dark:border-border shadow-md hover:shadow-lg transition-shadow bg-card dark:bg-card">
                <CardContent className="p-4 flex flex-col items-center justify-center">
                  <div className="rounded-full bg-success/10 dark:bg-success/20 p-3 mb-2">
                    <CheckCircle className="w-5 h-5 text-success" />
                  </div>
                  <p className="text-2xl font-bold">{completedRepairs}</p>
                  <p className="text-sm text-muted-foreground">已完成</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent Repair Reports */}
          <div>
            <h2 className="text-xl font-semibold mb-4">近期报修</h2>
            <Card className="border-border/50 dark:border-border shadow-md bg-card dark:bg-card">
              <CardContent className="p-4 divide-y divide-border dark:divide-border">
                {recentRepairs.length > 0 ? (
                  recentRepairs.map((repair, index) => (
                    <div key={index} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{repair.deviceName || repair.deviceModel}</span>
                          {getStatusBadge(repair.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{repair.problem}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{repair.reportedAt}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))
                ) : (
                  <div className="py-3 text-center">
                    <p className="text-muted-foreground">暂无报修记录</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Account Settings */}
            <div>
              <h2 className="text-xl font-semibold mb-4">账户设置</h2>

              {/* Menu Items */}
              <Card className="border-border/50 dark:border-border shadow-md bg-card dark:bg-card">
                <CardContent className="p-0 divide-y divide-border dark:divide-border">
                  {menuItems.map((item, index) => {
                    const Icon = item.icon
                    // 计算未读通知数量
                    const unreadNotifications = userNotifications.filter(n => !n.read).length
                    const badgeCount = item.label === "通知中心" ? unreadNotifications : item.label === "我的报告" ? userRepairs.length : ""
                    return (
                      <button
                        key={index}
                        onClick={() => handleMenuClick(item.label)}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="w-4.5 h-4.5 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {badgeCount !== "" && badgeCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                              {badgeCount}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Device Types */}
            <div>
              <h2 className="text-xl font-semibold mb-4">设备类型统计</h2>
              <Card className="border-border/50 dark:border-border shadow-md bg-card dark:bg-card">
                <CardContent className="p-4">
                  {userRepairs.length > 0 ? (
                    <div className="space-y-3">
                      {/* 这里可以添加设备类型统计图表 */}
                      <div className="flex items-center justify-between">
                        <span>人脸识别终端</span>
                        <span className="text-sm text-muted-foreground">
                          {userRepairs.filter(r => r.deviceModel?.includes('FR')).length} 台
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>门禁控制器</span>
                        <span className="text-sm text-muted-foreground">
                          {userRepairs.filter(r => r.deviceModel?.includes('200')).length} 台
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>读卡器</span>
                        <span className="text-sm text-muted-foreground">
                          {userRepairs.filter(r => r.deviceModel?.includes('R10')).length} 台
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>其他设备</span>
                        <span className="text-sm text-muted-foreground">
                          {userRepairs.filter(r => 
                            !r.deviceModel?.includes('FR') && 
                            !r.deviceModel?.includes('200') && 
                            !r.deviceModel?.includes('R10')
                          ).length} 台
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 text-center">
                      <p className="text-muted-foreground">暂无设备数据</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      
      {/* 我的报告对话框 */}
      <Dialog open={openDialog === "我的报告"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">我的报告</DialogTitle>
            <DialogDescription>查看您提交的所有维修报告</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {userRepairs.length > 0 ? (
              userRepairs.map((report) => (
                <Card key={report.id} className="border-border/50 dark:border-border bg-card dark:bg-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{report.deviceName || report.deviceModel}</h3>
                          {getStatusBadge(report.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">位置: {report.location}</p>
                        <p className="text-sm text-muted-foreground mb-2">故障: {report.problem}</p>
                        <p className="text-xs text-muted-foreground">报修时间: {report.reportedAt}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">暂无报告</p>
                <p className="text-xs text-muted-foreground mt-1">您还没有提交过维修报告</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 通知中心对话框 */}
      <Dialog open={openDialog === "通知中心"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  通知中心
                </DialogTitle>
                <DialogDescription>查看系统通知和消息</DialogDescription>
              </div>
              {userNotifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    markAllAsRead()
                  }}
                  className="text-xs"
                >
                  全部标记为已读
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 mt-4">
            {userNotifications.length > 0 ? (
              userNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={cn(
                    "border-border/50 dark:border-border bg-card dark:bg-card cursor-pointer transition-all hover:shadow-md",
                    !notification.read && "border-primary/50 bg-primary/5 dark:bg-primary/10"
                  )}
                  onClick={() => {
                    if (!notification.read) {
                      markAsRead(notification.id)
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                        notification.type === "repair_started" && "bg-blue-100 dark:bg-blue-900/30",
                        notification.type === "repair_completed" && "bg-green-100 dark:bg-green-900/30",
                        notification.type === "repair_unrepairable" && "bg-red-100 dark:bg-red-900/30"
                      )}>
                        {notification.type === "repair_started" ? (
                          <Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        ) : notification.type === "repair_completed" ? (
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : notification.type === "repair_unrepairable" ? (
                          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        ) : (
                          <Bell className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-sm">{notification.title}</h3>
                          {!notification.read && (
                            <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                        {notification.deviceName && (
                          <p className="text-xs text-muted-foreground mb-1">
                            设备: {notification.deviceName || notification.deviceModel}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">{notification.createdAt}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground font-medium">暂无通知</p>
                <p className="text-xs text-muted-foreground mt-1">您还没有收到任何通知</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 设置对话框 */}
      <Dialog open={openDialog === "设置"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Settings className="w-5 h-5" />
              设置
            </DialogTitle>
            <DialogDescription>管理您的账户和系统设置</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">推送通知</Label>
                  <p className="text-sm text-muted-foreground">接收系统通知和提醒</p>
                </div>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">邮件通知</Label>
                  <p className="text-sm text-muted-foreground">通过邮件接收重要通知</p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">深色模式</Label>
                  <p className="text-sm text-muted-foreground">切换深色/浅色主题</p>
                </div>
                <Switch 
                  checked={isDarkMode} 
                  onCheckedChange={(checked) => {
                    setTheme(checked ? "dark" : "light");
                  }} 
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 帮助中心对话框 */}
      <Dialog open={openDialog === "帮助中心"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              帮助中心
            </DialogTitle>
            <DialogDescription>常见问题和帮助文档</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Tabs defaultValue="faq" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="faq">常见问题</TabsTrigger>
                <TabsTrigger value="contact">联系我们</TabsTrigger>
              </TabsList>
              <TabsContent value="faq" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      如何提交维修报告？
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      在维修工单页面点击"新建维修"按钮，填写设备信息和故障描述，上传相关照片后提交即可。
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      如何查看维修进度？
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      在维修工单列表中点击对应的工单卡片，即可查看详细的维修进度和状态。
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      如何修改个人信息？
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      在个人中心页面，点击"编辑"按钮即可修改您的姓名、电话和头像。
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="contact" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">联系方式</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">客服热线: 13603050631</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">邮箱: lhwvery666@gmail.com</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">在线客服: 工作日 9:00-18:00</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}