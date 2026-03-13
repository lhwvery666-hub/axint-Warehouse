"use client"

import { useState, useEffect } from "react"
import {
  User, Phone, Save, Edit2, LogOut, Loader2,
  Package, CheckCircle, Clock, Truck, Settings, Moon, Sun,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAuth } from "@/context/auth-context"
import { useTheme } from "next-themes"

export default function WarehouseProfile() {
  const { user, logout, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()

  // ── 编辑状态 ──────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [editedUser, setEditedUser] = useState({ realName: "", phone: "" })

  // ── 统计数据 ──────────────────────────────────────────────
  const [stats, setStats] = useState({
    totalConfirmed: 0,
    totalShipped: 0,
    pendingConfirm: 0,
    pendingShip: 0,
  })

  // 初始化编辑表单
  useEffect(() => {
    if (user) {
      setEditedUser({
        realName: user.realName || "",
        phone: user.phone || "",
      })
    }
  }, [user])

  // 拉取仓库统计数据
  useEffect(() => {
    async function fetchStats() {
      try {
        const [pendingRes, completedRes] = await Promise.all([
          fetch("/api/tickets/warehouse-pending-batches"),
          fetch("/api/tickets/warehouse-completed-batches"),
        ])
        const pendingJson = pendingRes.ok ? await pendingRes.json() : null
        const completedJson = completedRes.ok ? await completedRes.json() : null

        const pendingBatches: unknown[] = pendingJson?.data ?? []
        const completedBatches: unknown[] = completedJson?.data ?? []

        setStats({
          pendingConfirm: (pendingBatches as { status?: string }[]).filter(
            (b) => b.status === "WAREHOUSE_CONFIRMING" || b.status === "Created",
          ).length,
          pendingShip: (pendingBatches as { status?: string }[]).filter(
            (b) => b.status === "WAREHOUSE_SHIPPING",
          ).length,
          totalConfirmed: completedBatches.length,
          totalShipped: completedBatches.length,
        })
      } catch {
        // Non-critical — stats remain at 0
      }
    }
    fetchStats()
  }, [])

  // ── 保存个人信息 ──────────────────────────────────────────
  const handleSave = async () => {
    if (!editedUser.realName.trim()) {
      alert("姓名不能为空")
      return
    }
    if (editedUser.phone) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(editedUser.phone)) {
        alert("手机号格式不正确，请输入11位有效手机号")
        return
      }
    }
    try {
      setIsSaving(true)
      const res = await fetch(`/api/users/${user?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName: editedUser.realName.trim(),
          phoneNumber: editedUser.phone, // API field name is phoneNumber
        }),
      })
      const result = await res.json()
      if (result.success) {
        await refreshUser() // Sync AuthContext so chat/logs use the new name
        setIsEditing(false)
        alert("个人信息已更新")
      } else {
        alert(result.message || "更新失败，请重试")
      }
    } catch {
      alert("更新失败，请检查网络连接")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditToggle = () => {
    if (isEditing) {
      handleSave()
    } else {
      setIsEditing(true)
    }
  }

  const handleLogout = () => {
    setIsLoggingOut(true)
    setTimeout(() => {
      logout()
      setIsLoggingOut(false)
    }, 800)
  }

  const isDarkMode = theme === "dark"

  const statCards = [
    { icon: Clock,       label: "待确认批次", value: stats.pendingConfirm, color: "text-warning" },
    { icon: Truck,       label: "待发货批次", value: stats.pendingShip,    color: "text-primary" },
    { icon: CheckCircle, label: "已确认批次", value: stats.totalConfirmed, color: "text-success" },
    { icon: Package,     label: "已发货批次", value: stats.totalShipped,   color: "text-blue-500" },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-background via-background to-primary/5 min-h-screen">
      <div className="grid md:grid-cols-3 gap-6">

        {/* ── 左栏：个人信息 + 退出 ───────────────────────── */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-lg overflow-hidden">
            <CardHeader className="bg-primary/5 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                个人信息
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEditToggle}
                disabled={isSaving}
                className="h-8 px-2 text-primary"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEditing ? (
                  <span className="flex items-center gap-1">
                    <Save className="h-4 w-4" />
                    保存
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Edit2 className="h-4 w-4" />
                    编辑
                  </span>
                )}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {/* Avatar area */}
              <div className="bg-primary/10 px-5 py-6 flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className="bg-primary/20 text-primary text-lg font-semibold">
                    {(editedUser.realName || user?.realName || "仓")?.substring(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        value={editedUser.realName}
                        onChange={(e) => setEditedUser((prev) => ({ ...prev, realName: e.target.value }))}
                        placeholder="请输入真实姓名"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={editedUser.phone}
                        onChange={(e) => setEditedUser((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="请输入手机号"
                        className="h-8 text-sm"
                      />
                    </div>
                  ) : (
                    <>
                      <p className="text-lg font-semibold">{user?.realName || "未设置姓名"}</p>
                      <p className="text-sm text-muted-foreground">仓库管理员</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {user?.phone || "未设置手机号"}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* User meta */}
              <div className="px-5 py-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">用户 ID</span>
                  <span className="font-mono">{user?.id ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">角色</span>
                  <span>仓库管理员</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 退出登录 */}
          <Button
            variant="outline"
            className="w-full h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive bg-transparent"
            onClick={handleLogout}
            disabled={isLoggingOut || isEditing}
          >
            {isLoggingOut ? (
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

          <p className="text-center text-xs text-muted-foreground">Version 1.0.0</p>
        </div>

        {/* ── 右栏：统计 + 设置 ──────────────────────────── */}
        <div className="md:col-span-2 space-y-6">

          {/* 仓库工作统计 */}
          <div>
            <h2 className="text-xl font-semibold mb-4">仓库统计</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statCards.map(({ icon: Icon, label, value, color }) => (
                <Card key={label} className="border-border/50 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-4 flex flex-col items-center justify-center">
                    <div className="rounded-full bg-muted p-3 mb-2">
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-muted-foreground text-center">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* 账户设置 */}
          <div>
            <h2 className="text-xl font-semibold mb-4">
              <span className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                账户设置
              </span>
            </h2>
            <Card className="border-border/50 shadow-md">
              <CardHeader>
                <CardDescription>管理系统偏好设置</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium flex items-center gap-2">
                      {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                      深色模式
                    </Label>
                    <p className="text-sm text-muted-foreground">切换深色 / 浅色主题</p>
                  </div>
                  <Switch
                    checked={isDarkMode}
                    onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">修改密码</Label>
                    <p className="text-sm text-muted-foreground">通过管理员重置账户密码</p>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    联系管理员
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
