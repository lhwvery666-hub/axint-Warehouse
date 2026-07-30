"use client"

import { Home, Wrench, User, LogOut, Database, Trash2 } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { UserRole } from "@/lib/enums"

interface NavItem {
  id: "home" | "repair" | "profile"
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface AppSidebarProps {
  activeTab: "home" | "repair" | "profile" | "recycle"
  onTabChange: (tab: "home" | "repair" | "profile" | "recycle") => void
  userType?: UserRole | "technician" | "reporter" | "admin" | "warehouse" | "business" | null
}

export default function AppSidebar({ activeTab, onTabChange, userType }: AppSidebarProps) {
  const { user, logout } = useAuth()
  
  // 根据传入的用户类型或者认证上下文中的角色显示不同的导航项
  const effectiveUserType = userType || user?.role || UserRole.TECHNICIAN
  
  // 根据用户角色显示不同的导航项
  const navItems: NavItem[] = effectiveUserType === "reporter" 
    ? [
        // 报告人员只能看到报修页面
        { id: "repair", label: "故障报修", icon: Wrench },
        { id: "profile", label: "个人中心", icon: User },
      ]
    : [
        // 维修人员可以看到所有页面
        { id: "home", label: "首页", icon: Home },
        { id: "repair", label: "维修工单", icon: Wrench },
        { id: "profile", label: "个人中心", icon: User },
      ]
      
  // 添加数据库管理链接（仅限维修工程师/管理员）
  const handleDatabaseClick = () => {
    window.location.href = "/admin/database";
  }

  // 从 user context 获取用户名（不再使用 localStorage）
  const userName = user?.realName || user?.id || null

  return (
    <aside className="fixed left-0 top-0 z-30 h-full w-64 flex-col border-r border-border bg-card shadow-[8px_0_28px_-28px_rgba(15,23,42,0.7)] dark:border-border dark:bg-card hidden md:flex">
      <div className="flex h-16 items-center border-b border-border dark:border-border px-6">
        <div className="group flex items-center gap-2">
          <img src="/icon.svg" alt="Logo" className="h-6 w-6 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 motion-reduce:transform-none" />
          <span className="text-lg font-semibold">智能维修系统</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            
            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-[color,background-color,box-shadow,transform] duration-200 ease-out hover:translate-x-1 hover:shadow-sm active:translate-x-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transform-none motion-reduce:transition-none",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20 dark:bg-primary dark:text-primary-foreground"
                      : "hover:bg-muted dark:hover:bg-muted"
                  )}
                >
                  <Icon className={cn("h-5 w-5 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none", isActive ? "" : "text-muted-foreground")} />
                  <span>{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* 回收站入口（仅非现场报告人员显示） */}
        {effectiveUserType !== "reporter" && (
          <div className="mt-4">
            <button
              onClick={() => onTabChange("recycle")}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-[color,background-color,box-shadow,transform] duration-200 ease-out hover:translate-x-1 hover:shadow-sm active:translate-x-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transform-none motion-reduce:transition-none",
                activeTab === "recycle"
                  ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20 dark:bg-primary dark:text-primary-foreground"
                  : "hover:bg-muted dark:hover:bg-muted"
              )}
            >
              <Trash2 className={cn("h-5 w-5 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none", activeTab === "recycle" ? "" : "text-muted-foreground")} />
              <span>工单回收站</span>
            </button>
          </div>
        )}
      </nav>
      <div className="border-t border-border dark:border-border p-4 space-y-3">
        <div className="group flex items-center gap-3 rounded-lg border border-transparent bg-muted p-3 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/15 hover:shadow-md motion-reduce:transform-none dark:bg-muted">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none">
            <span className="text-sm font-medium text-primary-foreground">
              {userName?.substring(0, 2) || "用户"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName || "用户"}</p>
            <p className="text-xs text-muted-foreground">
              {effectiveUserType === "reporter" 
                ? "现场报告人员" 
                : effectiveUserType === "admin"
                ? "管理员"
                : effectiveUserType === "warehouse"
                ? "仓库管理员"
                : "维修工程师"}
            </p>
            {user?.id && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                ID: {user.id}
              </p>
            )}
          </div>
        </div>
        
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full justify-start text-muted-foreground hover:text-destructive" 
          onClick={logout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </Button>
      </div>
    </aside>
  )
}
