import type { LucideIcon } from "lucide-react"
import {
  BriefcaseBusiness,
  ClipboardPenLine,
  Package,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react"

import { normalizeUserRole, UserRole } from "@/lib/enums"
import { cn } from "@/lib/utils"

export interface RolePresentation {
  label: string
  description: string
  Icon: LucideIcon
  avatarClassName: string
  haloClassName: string
  badgeClassName: string
}

export const ROLE_PRESENTATION: Record<UserRole, RolePresentation> = {
  [UserRole.TECHNICIAN]: {
    label: "维修工程师",
    description: "聚焦设备检查、维修方案与最终复检",
    Icon: Wrench,
    avatarClassName: "bg-blue-600 text-white shadow-blue-500/25",
    haloClassName: "border-blue-400/60 bg-blue-400/15",
    badgeClassName: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300",
  },
  [UserRole.REPORTER]: {
    label: "现场报告人员",
    description: "跟进现场报修、签字确认与工单进度",
    Icon: ClipboardPenLine,
    avatarClassName: "bg-emerald-600 text-white shadow-emerald-500/25",
    haloClassName: "border-emerald-400/60 bg-emerald-400/15",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  [UserRole.BUSINESS]: {
    label: "商务人员",
    description: "处理费用审核、收款及开票跟进",
    Icon: BriefcaseBusiness,
    avatarClassName: "bg-violet-600 text-white shadow-violet-500/25",
    haloClassName: "border-violet-400/60 bg-violet-400/15",
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300",
  },
  [UserRole.WAREHOUSE]: {
    label: "仓库管理员",
    description: "负责设备确认、返厂跟进与仓库发货",
    Icon: Package,
    avatarClassName: "bg-amber-500 text-white shadow-amber-500/25",
    haloClassName: "border-amber-400/60 bg-amber-400/15",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  },
  [UserRole.ADMIN]: {
    label: "系统管理员",
    description: "维护系统用户、权限和全局工单运行",
    Icon: ShieldCheck,
    avatarClassName: "bg-slate-900 text-white shadow-slate-500/25 dark:bg-slate-100 dark:text-slate-900",
    haloClassName: "border-slate-400/60 bg-slate-400/15",
    badgeClassName: "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  },
}

const UNKNOWN_ROLE_PRESENTATION: RolePresentation = {
  label: "系统用户",
  description: "系统用户",
  Icon: UserRound,
  avatarClassName: "bg-slate-500 text-white shadow-slate-500/20",
  haloClassName: "border-slate-400/50 bg-slate-400/10",
  badgeClassName: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300",
}

export function getRolePresentation(role: string | UserRole | null | undefined): RolePresentation {
  const normalizedRole = normalizeUserRole(role)
  return normalizedRole ? ROLE_PRESENTATION[normalizedRole] : UNKNOWN_ROLE_PRESENTATION
}

type RoleAvatarSize = "sm" | "md" | "xl"

interface RoleAvatarProps {
  role: string | UserRole | null | undefined
  size?: RoleAvatarSize
  animated?: boolean
  showOnline?: boolean
  className?: string
}

const SIZE_CLASSES: Record<RoleAvatarSize, {
  container: string
  inner: string
  icon: string
  orbit: string
  status: string
}> = {
  sm: {
    container: "h-8 w-8",
    inner: "h-7 w-7",
    icon: "h-4 w-4",
    orbit: "inset-0.5",
    status: "bottom-0 right-0 h-2.5 w-2.5 border-2",
  },
  md: {
    container: "h-10 w-10",
    inner: "h-9 w-9",
    icon: "h-5 w-5",
    orbit: "inset-0.5",
    status: "bottom-0 right-0 h-3 w-3 border-2",
  },
  xl: {
    container: "h-28 w-28",
    inner: "h-20 w-20",
    icon: "h-9 w-9",
    orbit: "inset-2",
    status: "bottom-2 right-2 h-4 w-4 border-[3px]",
  },
}

export function RoleAvatar({
  role,
  size = "sm",
  animated = false,
  showOnline = false,
  className,
}: RoleAvatarProps) {
  const presentation = getRolePresentation(role)
  const { Icon } = presentation
  const sizes = SIZE_CLASSES[size]

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", sizes.container, className)}
      role="img"
      aria-label={`${presentation.label}角色头像`}
      title={presentation.label}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-full border",
          animated && "motion-safe:animate-pulse motion-reduce:animate-none",
          presentation.haloClassName
        )}
      />
      {size === "xl" && (
        <div
          className={cn(
            "absolute rounded-full border border-dashed border-current/30",
            sizes.orbit,
            animated && "motion-safe:animate-[spin_14s_linear_infinite] motion-reduce:animate-none"
          )}
        >
          <span className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-current shadow-sm" />
        </div>
      )}
      <div
        className={cn(
          "relative grid place-items-center rounded-full shadow-lg transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none",
          sizes.inner,
          presentation.avatarClassName
        )}
      >
        <Icon className={sizes.icon} strokeWidth={1.8} />
      </div>
      {showOnline && (
        <span
          className={cn("absolute rounded-full border-card bg-emerald-500", sizes.status)}
          aria-label="在线"
        />
      )}
    </div>
  )
}
