"use client"

import { useState, useEffect, useRef } from "react"
import { Settings, LogOut, Camera, Pencil, Check, User2, Loader2, Users, Shield, Mail, Phone, Calendar, KeyRound, BadgeCheck, Database, UserCheck, Bell, FileText, HelpCircle, ChevronRight, MessageSquare, Info, ChevronDown, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAuth } from "@/context/auth-context"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useRepairContext } from "@/context/RepairContext"
import { cn } from "@/lib/utils"

const menuItems = [
  { icon: FileText, label: "我的报告", badge: "" },
  { icon: Bell, label: "通知中心", badge: "" },
  { icon: Settings, label: "设置" },
  { icon: HelpCircle, label: "帮助中心" },
]

export default function AdminProfile() {
  const { user, logout } = useAuth()
  const { repairs } = useRepairContext()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
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
  
  // 权限说明折叠状态
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false)
  
  // 设置状态
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [emailNotifications, setEmailNotifications] = useState(false)
  
  // 从主题获取深色模式状态
  const isDarkMode = theme === "dark"
  
  // 获取当前用户的报告（如果有的话）
  const userReports = repairs.filter(repair => {
    return repair.reportedBy === user?.realName || repair.reportedBy === user?.id
  })

  useEffect(() => {
    if (user) {
      setEditedUser({
        realName: user.realName || "",
        phone: user.phone || "",
        avatar: user.avatar || "/placeholder-user.jpg"
      })
    }
  }, [user])

  const handleLogout = () => {
    setIsLoading(true)
    setTimeout(() => {
      logout()
      setIsLoading(false)
    }, 1000)
  }

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
        setIsEditing(false)
        alert("个人信息已更新")
      }, 500)
    } else {
      setIsEditing(true)
    }
  }

  const handleAvatarClick = () => {
    if (isEditing && avatarInputRef.current) {
      avatarInputRef.current.click()
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      // 创建临时URL用于预览
      const imageUrl = URL.createObjectURL(file)
      setEditedUser(prev => ({ ...prev, avatar: imageUrl }))
    }
  }

  // 根据角色返回首页路径
  const getHomePath = () => {
    if (user?.role === "admin") {
      return "/admin/users"
    } else if (user?.role === "warehouse") {
      return "/admin/database"
    }
    return "/"
  }

  const userName = user?.realName || user?.id || ""
  const isAdmin = user?.role === "admin"
  
  const handleMenuClick = (label: string) => {
    setOpenDialog(label)
  }
  
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      pending: { label: "待处理", className: "bg-warning/15 text-warning-foreground" },
      processing: { label: "处理中", className: "bg-primary/15 text-primary" },
      completed: { label: "已完成", className: "bg-success/15 text-success" },
      unrepairable: { label: "无法维修", className: "bg-destructive/15 text-destructive" },
    }
    const statusInfo = statusMap[status] || { label: status, className: "bg-muted" }
    return (
      <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 dark:from-background dark:via-background dark:to-primary/10">
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">个人信息</h1>
            <p className="text-muted-foreground mt-1">管理您的账户信息和权限设置</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => router.push(getHomePath())}
            className="hidden md:flex"
          >
            返回首页
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Profile Card */}
          <div className="space-y-6">
            {/* Profile Header Card */}
            <Card className="border-border/50 dark:border-border overflow-hidden shadow-lg bg-card dark:bg-card">
              <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10 dark:to-transparent p-6">
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative group">
                    <Avatar className={cn(
                      "w-24 h-24 border-4 border-background shadow-xl transition-all",
                      isEditing && "ring-4 ring-primary/20 ring-offset-2"
                    )}>
                      <AvatarImage src={editedUser.avatar} alt={editedUser.realName} />
                      <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                        {editedUser.realName?.substring(0, 2) || "用户"}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <button
                        onClick={handleAvatarClick}
                        className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all hover:scale-110"
                      >
                        <Camera className="h-4 w-4" />
                      </button>
                    )}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </div>
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <h3 className="text-xl font-bold">{editedUser.realName || "未设置"}</h3>
                      {isAdmin ? (
                        <BadgeCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <UserCheck className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "text-sm px-3 py-1",
                        isAdmin && "bg-primary/10 text-primary border-primary/20",
                        !isAdmin && "bg-blue-500/10 text-blue-600 border-blue-500/20"
                      )}
                    >
                      {isAdmin ? "系统管理员" : "仓库管理员"}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <CardContent className="p-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <User2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">用户名</p>
                      <p className="text-sm font-medium truncate">{userName || "-"}</p>
                    </div>
                  </div>
                  
                  {!isEditing ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Phone className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">联系电话</p>
                        <p className="text-sm font-medium">{editedUser.phone || "未设置"}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="realName" className="text-xs font-medium">姓名（实名）*</Label>
                        <Input
                          id="realName"
                          value={editedUser.realName}
                          onChange={(e) => setEditedUser({ ...editedUser, realName: e.target.value })}
                          placeholder="请输入真实姓名"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-xs font-medium">联系电话</Label>
                        <Input
                          id="phone"
                          value={editedUser.phone}
                          onChange={(e) => setEditedUser({ ...editedUser, phone: e.target.value })}
                          placeholder="如：13800138001"
                          className="h-9"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleEditToggle}
                    size="sm"
                  >
                    {isEditing ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        保存
                      </>
                    ) : (
                      <>
                        <Pencil className="mr-2 h-4 w-4" />
                        编辑信息
                      </>
                    )}
                  </Button>
                  {isEditing && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setIsEditing(false)
                        if (user) {
                          setEditedUser({
                            realName: user.realName || "",
                            phone: user.phone || "",
                            avatar: user.avatar || "/placeholder-user.jpg"
                          })
                        }
                      }}
                      size="sm"
                    >
                      <X className="mr-2 h-4 w-4" />
                      取消
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Permissions */}
          <div className="space-y-6">
            {/* Combined Actions & Settings */}
            <Card className="border-border/50 dark:border-border shadow-md bg-card dark:bg-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  功能菜单
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border dark:divide-border">
                {menuItems.map((item, index) => {
                  const Icon = item.icon
                  const badgeCount = item.label === "通知中心" ? 0 : item.label === "我的报告" ? userReports.length : ""
                  return (
                    <button
                      key={index}
                      onClick={() => handleMenuClick(item.label)}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
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

            {/* Role & Permissions - Collapsible */}
            <Card className="border-border/50 dark:border-border shadow-md bg-card dark:bg-card">
              <Collapsible open={isPermissionsOpen} onOpenChange={setIsPermissionsOpen}>
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent dark:from-primary/15 dark:to-transparent cursor-pointer hover:bg-primary/10 transition-colors">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl flex items-center gap-2">
                        {isAdmin ? (
                          <Shield className="h-5 w-5 text-primary" />
                        ) : (
                          <Database className="h-5 w-5 text-primary" />
                        )}
                        权限说明
                      </CardTitle>
                      <ChevronDown className={cn(
                        "h-5 w-5 text-muted-foreground transition-transform",
                        isPermissionsOpen && "transform rotate-180"
                      )} />
                    </div>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-6">
                    <div className="grid md:grid-cols-2 gap-3">
                      {isAdmin ? (
                        <>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Users className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">用户管理</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">管理所有用户账号和权限设置</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <UserCheck className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">权限审核</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">审核新注册用户并授予角色</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <KeyRound className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">人员录入</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">添加和管理系统用户</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <BadgeCheck className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">最高权限</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">拥有系统最高管理权限</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Database className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">设备数据库</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">管理设备种类、型号和设备信息</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Settings className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">维修工单</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">管理维修工单数据库</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Mail className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">数据导入导出</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">支持数据备份和恢复</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Calendar className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-xs mb-0.5">测试数据</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">生成和管理测试数据</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
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
            {userReports.length > 0 ? (
              userReports.map((report) => (
                <Card key={report.id} className="border-border/50">
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Bell className="w-5 h-5" />
              通知中心
            </DialogTitle>
            <DialogDescription>查看系统通知和消息</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            <div className="text-center py-8">
              <Bell className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground font-medium">暂无通知</p>
              <p className="text-xs text-muted-foreground mt-1">您还没有收到任何通知</p>
            </div>
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
                      如何管理用户账号？
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      在用户管理页面，您可以查看所有用户、添加新用户、编辑用户信息、分配角色和重置密码。
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      如何审核新注册用户？
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      在用户管理页面，找到状态为"未授权"的用户，点击编辑按钮为其分配相应的角色即可完成审核。
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
                      在个人信息页面，点击"编辑信息"按钮即可修改您的姓名、电话和头像。
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
