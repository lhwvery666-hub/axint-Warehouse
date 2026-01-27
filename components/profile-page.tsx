"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronRight, Settings, Bell, FileText, HelpCircle, LogOut, CheckCircle, Clock, Users, Camera, Pencil, Check, Loader2, X, Mail, Phone, MessageSquare, BookOpen, Info, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import { useRepairContext } from "@/context/RepairContext"
import { useTheme } from "next-themes"

const menuItems = [
  { icon: FileText, label: "我的报告", badge: "" },
  { icon: Bell, label: "通知中心", badge: "" },
  { icon: Settings, label: "设置" },
  { icon: HelpCircle, label: "帮助中心" },
]

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { repairs } = useRepairContext();
  const { theme, setTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState({
    realName: "",
    phone: "",
    avatar: ""
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  // 对话框状态
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  
  // 设置状态
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  
  // 从主题获取深色模式状态
  const isDarkMode = theme === "dark";
  
  // 获取当前用户的报告
  const userReports = repairs.filter(repair => {
    return repair.reportedBy === user?.realName || repair.reportedBy === user?.id;
  });

  useEffect(() => {
    if (user) {
      setEditedUser({
        realName: user.realName || "",
        phone: user.phone || "",
        avatar: user.avatar || "/placeholder-user.jpg"
      });
    }
  }, [user]);

  const handleLogout = () => {
    setIsLoading(true);
    setTimeout(() => {
      logout();
      setIsLoading(false);
    }, 1000);
  };

  const handleEditToggle = async () => {
    if (isEditing) {
      // 验证手机号格式
      if (editedUser.phone) {
        const phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(editedUser.phone)) {
          alert("手机号格式不正确，请输入11位有效手机号")
          return
        }
      }
      
      // 保存更改到数据库（通过 API）
      try {
        setIsLoading(true)
        const response = await fetch(`/api/users/${user?.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            realName: editedUser.realName,
            phoneNumber: editedUser.phone || null,
          }),
        })
        
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.message || '更新失败')
        }
        
        // 更新本地用户信息（需要刷新页面或重新获取用户信息）
        alert("个人信息已更新")
        setIsEditing(false)
        // 刷新页面以更新用户信息
        window.location.reload()
      } catch (error: any) {
        console.error('保存用户信息失败:', error)
        alert(error.message || '保存失败，请重试')
      } finally {
        setIsLoading(false)
      }
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
  
  const handleMenuClick = (label: string) => {
    setOpenDialog(label);
  };
  
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      pending: { label: "待处理", className: "bg-warning/15 text-warning-foreground" },
      processing: { label: "处理中", className: "bg-primary/15 text-primary" },
      completed: { label: "已完成", className: "bg-success/15 text-success" },
      unrepairable: { label: "无法维修", className: "bg-destructive/15 text-destructive" },
    };
    const statusInfo = statusMap[status] || { label: status, className: "bg-muted" };
    return (
      <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-background via-background to-primary/5 dark:from-background dark:via-background dark:to-primary/10 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">个人中心</h1>
        <p className="text-sm text-muted-foreground mt-1">管理您的个人信息和账户设置</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column - Profile Card */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border/50 dark:border-border shadow-lg overflow-hidden bg-card dark:bg-card">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">个人信息</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleEditToggle}
                className="h-8 px-3 text-primary hover:bg-primary/10"
              >
                {isEditing ? (
                  <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    保存
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Pencil className="h-4 w-4" />
                    编辑
                  </span>
                )}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/20 dark:to-primary/15 px-6 py-8">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative">
                    <Avatar 
                      className={cn("w-24 h-24 border-4 border-background shadow-lg", isEditing && "cursor-pointer hover:opacity-80 transition-opacity")} 
                      onClick={handleAvatarClick}
                    >
                      <AvatarImage src={editedUser.avatar} alt="用户头像" />
                      <AvatarFallback className="text-2xl font-semibold">
                        {editedUser.realName?.substring(0, 2) || "用户"}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 shadow-md hover:shadow-lg transition-shadow">
                        <Camera className="h-4 w-4" />
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
                  <div className="w-full space-y-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <Input 
                          value={editedUser.realName}
                          onChange={(e) => setEditedUser(prev => ({ ...prev, realName: e.target.value }))}
                          placeholder="请输入您的真实姓名"
                          className="h-10 text-sm"
                        />
                        <div className="space-y-1">
                          <Input 
                            type="tel"
                            value={editedUser.phone}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '') // 只允许数字
                              setEditedUser(prev => ({ ...prev, phone: value }))
                            }}
                            placeholder="请输入11位手机号"
                            maxLength={11}
                            className="h-10 text-sm"
                          />
                          {editedUser.phone && !/^1[3-9]\d{9}$/.test(editedUser.phone) && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              手机号格式不正确
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-xl font-bold text-foreground">{editedUser.realName || "未设置实名"}</h2>
                        <p className="text-sm text-muted-foreground">{user?.role === "technician" ? "维修工程师" : "现场报告人员"}</p>
                        <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                          <Phone className="h-4 w-4" />
                          {editedUser.phone || "未设置"}
                        </p>
                        {user?.username && (
                          <p className="text-xs text-muted-foreground">用户名: {user.username}</p>
                        )}
                        {user?.role && (
                          <p className="text-xs text-muted-foreground">
                            角色: {user.role === "admin" ? "管理员" : 
                                   user.role === "technician" ? "维修工程师" :
                                   user.role === "warehouse" ? "仓库管理员" :
                                   user.role === "reporter" ? "现场报告人员" : "普通员工"}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border bg-muted/30 dark:bg-muted/50 dark:divide-border">
                <div className="text-center py-4">
                  <p className="text-2xl font-bold text-primary">0</p>
                  <p className="text-xs text-muted-foreground mt-1">总任务数</p>
                </div>
                <div className="text-center py-4">
                  <p className="text-2xl font-bold text-success">0</p>
                  <p className="text-xs text-muted-foreground mt-1">已完成</p>
                </div>
                <div className="text-center py-4">
                  <p className="text-2xl font-bold text-foreground">--</p>
                  <p className="text-xs text-muted-foreground mt-1">评分</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logout Button */}
          <Button
            variant="outline"
            className="w-full h-12 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 bg-transparent shadow-md"
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

        {/* Right Column - Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Performance Metrics */}
          <div>
            <h2 className="text-xl font-bold mb-4">绩效指标</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/50 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6 flex flex-col items-center justify-center">
                  <div className="rounded-full bg-primary/10 p-4 mb-3">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-3xl font-bold mb-1">--</p>
                  <p className="text-sm text-muted-foreground">平均响应时间</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6 flex flex-col items-center justify-center">
                  <div className="rounded-full bg-success/10 p-4 mb-3">
                    <CheckCircle className="w-6 h-6 text-success" />
                  </div>
                  <p className="text-3xl font-bold mb-1">--</p>
                  <p className="text-sm text-muted-foreground">首次修复成功率</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6 flex flex-col items-center justify-center">
                  <div className="rounded-full bg-warning/10 p-4 mb-3">
                    <Users className="w-6 h-6 text-warning" />
                  </div>
                  <p className="text-3xl font-bold mb-1">--</p>
                  <p className="text-sm text-muted-foreground">客户满意度</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Account Settings and Recent Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Account Settings */}
            <div>
              <h2 className="text-xl font-bold mb-4">账户设置</h2>
              <Card className="border-border/50 dark:border-border shadow-md bg-card dark:bg-card">
                <CardContent className="p-0 divide-y divide-border dark:divide-border">
                  {menuItems.map((item, index) => {
                    const Icon = item.icon
                    const badgeCount = item.label === "通知中心" ? 0 : item.label === "我的报告" ? userReports.length : "";
                    return (
                      <button
                        key={index}
                        onClick={() => handleMenuClick(item.label)}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
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

            {/* Recent Activity */}
            <div>
              <h2 className="text-xl font-bold mb-4">近期活动</h2>
              <Card className="border-border/50 shadow-md">
                <CardContent className="p-6">
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground font-medium">暂无近期活动</p>
                    <p className="text-xs text-muted-foreground mt-1">您的活动记录将显示在这里</p>
                  </div>
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