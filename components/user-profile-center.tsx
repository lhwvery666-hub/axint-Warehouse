"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Hash,
  Loader2,
  Moon,
  Pencil,
  Phone,
  Save,
  Sun,
  UserRound,
  X,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getRolePresentation, RoleAvatar } from "@/components/role-avatar"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/context/auth-context"
import { useRepairContext } from "@/context/RepairContext"
import { USER_ROLE_LABELS, UserRole } from "@/lib/enums"
import { cn } from "@/lib/utils"
import { buildUserProfileStats, type ProfileStatTone } from "@/lib/user-profile-stats"

interface ProfileForm {
  realName: string
  phone: string
}

interface AccountMeta {
  createdAt: string | null
  updatedAt: string | null
}

interface ProfileApiPayload {
  success?: boolean
  message?: string
  data?: {
    createdAt?: string | null
    updatedAt?: string | null
  }
}

const STAT_TONE_CLASSES: Record<ProfileStatTone, string> = {
  blue: "border-blue-200/70 bg-blue-50/70 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300",
  amber: "border-amber-200/70 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  green: "border-emerald-200/70 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  violet: "border-violet-200/70 bg-violet-50/70 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300",
}

function parseProfilePayload(value: unknown): ProfileApiPayload | null {
  return value !== null && typeof value === "object"
    ? value as ProfileApiPayload
    : null
}

function formatDateTime(value: string | null): string {
  if (!value) return "暂无记录"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "暂无记录"
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export default function UserProfileCenter() {
  const { user, refreshUser } = useAuth()
  const { repairs, loading: repairsLoading } = useRepairContext()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<ProfileForm>({ realName: "", phone: "" })
  const [original, setOriginal] = useState<ProfileForm>({ realName: "", phone: "" })
  const [accountMeta, setAccountMeta] = useState<AccountMeta>({ createdAt: null, updatedAt: null })

  const userId = user?.id
  const role = user?.role ?? UserRole.TECHNICIAN
  const presentation = getRolePresentation(role)
  const stats = useMemo(() => buildUserProfileStats(role, repairs), [repairs, role])
  const isDirty = form.realName.trim() !== original.realName.trim()
    || form.phone.trim() !== original.phone.trim()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const next = {
      realName: user?.realName || "",
      phone: user?.phone || "",
    }
    setForm(next)
    setOriginal(next)
  }, [user?.id, user?.realName, user?.phone])

  const loadAccountMeta = useCallback(async () => {
    if (!userId) return
    try {
      const response = await fetch(`/api/users/${userId}`, { cache: "no-store" })
      const payload = parseProfilePayload(await response.json().catch(() => null))
      if (!response.ok || !payload?.success) return
      setAccountMeta({
        createdAt: payload.data?.createdAt || null,
        updatedAt: payload.data?.updatedAt || null,
      })
    } catch (error: unknown) {
      console.error("加载账户时间信息失败:", error)
    }
  }, [userId])

  useEffect(() => {
    void loadAccountMeta()
  }, [loadAccountMeta])

  const handleCancel = () => {
    setForm(original)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!user?.id) return
    const normalized: ProfileForm = {
      realName: form.realName.trim(),
      phone: form.phone.trim(),
    }

    if (!normalized.realName) {
      toast.error("姓名不能为空")
      return
    }
    if (normalized.phone && !/^1[3-9]\d{9}$/.test(normalized.phone)) {
      toast.error("手机号格式不正确，请输入 11 位有效手机号")
      return
    }
    if (!isDirty) {
      toast.info("信息没有变化，无需保存")
      return
    }

    try {
      setIsSaving(true)
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName: normalized.realName,
          phoneNumber: normalized.phone || null,
        }),
      })
      const payload = parseProfilePayload(await response.json().catch(() => null))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "保存失败，请稍后重试")
      }

      setForm(normalized)
      setOriginal(normalized)
      setIsEditing(false)
      await Promise.all([refreshUser(), loadAccountMeta()])
      toast.success("个人信息已更新")
    } catch (error: unknown) {
      console.error("保存个人信息失败:", error)
      toast.error(error instanceof Error ? error.message : "保存失败，请稍后重试")
    } finally {
      setIsSaving(false)
    }
  }

  if (!user) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-background via-background to-muted/30">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
        <header>
          <p className="text-sm font-medium text-primary">个人中心</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">账户与工作概览</h1>
          <p className="mt-2 text-muted-foreground">管理本人基础资料，查看当前角色需要关注的工作。</p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.4fr)]">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <div className="border-b bg-gradient-to-br from-primary/8 via-background to-muted/50 px-6 py-7">
              <div className="flex flex-col items-center text-center">
                <RoleAvatar role={role} size="xl" animated showOnline />
                <h2 className="mt-4 text-2xl font-bold">{user.realName || "未设置姓名"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">@{user.username}</p>
                <Badge variant="outline" className={cn("mt-3 px-3 py-1", presentation.badgeClassName)}>
                  <BadgeCheck className="mr-1.5 h-4 w-4" />
                  {USER_ROLE_LABELS[role]}
                </Badge>
                <p className="mt-3 max-w-sm text-sm text-muted-foreground">{presentation.description}</p>
              </div>
            </div>

            <CardContent className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UserRound className="h-4 w-4" />用户名
                  </div>
                  <p className="mt-1 truncate font-medium">{user.username}</p>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Hash className="h-4 w-4" />用户 ID
                  </div>
                  <p className="mt-1 font-medium">{user.id}</p>
                </div>
              </div>

              <Separator />

              {isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-real-name">姓名</Label>
                    <Input
                      id="profile-real-name"
                      value={form.realName}
                      maxLength={100}
                      autoComplete="name"
                      onChange={(event) => setForm((current) => ({ ...current, realName: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">联系电话</Label>
                    <Input
                      id="profile-phone"
                      value={form.phone}
                      maxLength={11}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="未设置"
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </div>
                  {!isDirty && (
                    <p className="text-xs text-muted-foreground">当前信息没有变化，保存按钮暂不可用。</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">姓名</p>
                        <p className="truncate font-medium">{user.realName || "未设置"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">联系电话</p>
                        <p className="truncate font-medium">{user.phone || "未设置"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button variant="outline" className="flex-1" onClick={handleCancel} disabled={isSaving}>
                      <X className="mr-2 h-4 w-4" />取消
                    </Button>
                    <Button className="flex-1" onClick={handleSave} disabled={isSaving || !isDirty}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      保存资料
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => setIsEditing(true)}>
                    <Pencil className="mr-2 h-4 w-4" />编辑个人资料
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />我的工作
                </CardTitle>
                <CardDescription>按工单去重统计，数据来自当前账号可见的真实工单。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {stats.map((stat) => (
                    <div key={stat.label} className={cn("rounded-2xl border p-4", STAT_TONE_CLASSES[stat.tone])}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{stat.label}</p>
                          <p className="mt-2 text-3xl font-bold tabular-nums">
                            {repairsLoading ? "—" : stat.value}
                          </p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 opacity-70" />
                      </div>
                      <p className="mt-2 text-xs opacity-75">{stat.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">账户信息</CardTitle>
                  <CardDescription>只读的账户生命周期信息。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">账号创建时间</p>
                      <p className="mt-1 text-sm font-medium">{formatDateTime(accountMeta.createdAt)}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">资料最近更新</p>
                      <p className="mt-1 text-sm font-medium">{formatDateTime(accountMeta.updatedAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">显示设置</CardTitle>
                  <CardDescription>仅保留系统已真实支持的设置。</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                      {mounted && resolvedTheme === "dark"
                        ? <Moon className="h-5 w-5 text-primary" />
                        : <Sun className="h-5 w-5 text-primary" />}
                      <div>
                        <p className="font-medium">深色模式</p>
                        <p className="text-xs text-muted-foreground">切换后立即在本机生效</p>
                      </div>
                    </div>
                    <Switch
                      checked={mounted && resolvedTheme === "dark"}
                      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                      disabled={!mounted}
                      aria-label="切换深色模式"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
