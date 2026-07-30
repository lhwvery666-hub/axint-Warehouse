"use client"

import { Home, Wrench, User, LogOut } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useState, useEffect } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { UserRole } from "@/lib/enums"

interface BottomNavProps {
  activeTab: "home" | "repair" | "profile" | "recycle"
  onTabChange: (tab: "home" | "repair" | "profile") => void
  userType?: UserRole | "technician" | "reporter" | "admin" | "warehouse" | "business" | null
}

export default function BottomNav({ activeTab, onTabChange, userType }: BottomNavProps) {
  const { user, logout } = useAuth()
  const [userAvatar, setUserAvatar] = useState<string>("/placeholder-user.jpg")
  const [userRealName, setUserRealName] = useState<string>("")
  
  useEffect(() => {
    if (user) {
      setUserAvatar(user.avatar || "/placeholder-user.jpg")
      setUserRealName(user.realName || "")
    }
  }, [user])
  
  // 根据传入的用户类型或者认证上下文中的角色显示不同的导航项
  const effectiveUserType = userType || user?.role || "technician"
  
  // 根据用户角色显示不同的导航项
  const tabs = effectiveUserType === "reporter" 
    ? [
        // 报告人员只能看到报修页面和个人中心
        { id: "repair" as const, label: "报修", icon: Wrench },
        { id: "profile" as const, label: "我的", icon: User },
        { id: "logout" as const, label: "退出", icon: LogOut, action: logout },
      ]
    : [
        // 维修人员可以看到所有页面
        { id: "home" as const, label: "首页", icon: Home },
        { id: "repair" as const, label: "维修", icon: Wrench },
        { id: "profile" as const, label: "我的", icon: User },
        { id: "logout" as const, label: "退出", icon: LogOut, action: logout },
      ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md border-t border-border bg-card/90 shadow-[0_-14px_34px_-24px_rgba(15,23,42,0.7)] backdrop-blur-xl">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.action) {
                  tab.action();
                } else {
                  // 如果点击的是维修工单标签，通知父组件清除选中的工单ID
                  onTabChange(tab.id as "home" | "repair" | "profile");
                }
              }}
              className={`group relative flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden transition-[color,background-color,transform] duration-200 active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none ${
                isActive ? "bg-primary/5 text-primary" : "text-muted-foreground hover:-translate-y-0.5 hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <span className={`absolute inset-x-5 top-0 h-0.5 origin-center rounded-full bg-primary transition-transform duration-200 ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"}`} />
              {tab.id === "profile" ? (
                <Avatar className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none">
                  <AvatarImage src={userAvatar} alt="用户头像" />
                  <AvatarFallback>
                    <Icon className={`w-3 h-3 ${isActive ? "stroke-[2.5px]" : ""}`} />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Icon className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none ${isActive ? "stroke-[2.5px]" : ""}`} />
              )}
              <span className={`text-xs ${isActive ? "font-medium" : ""}`}>{tab.id === "profile" && userRealName ? userRealName.substring(0, 2) : tab.label}</span>
            </button>
          )
        })}
      </div>
      {/* Safe area padding for mobile devices */}
      <div className="h-safe-area-inset-bottom bg-card" />
    </nav>
  )
}
