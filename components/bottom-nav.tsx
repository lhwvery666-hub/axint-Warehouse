"use client"

import { Home, Wrench, User, LogOut } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useState, useEffect } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

interface BottomNavProps {
  activeTab: "home" | "repair" | "profile"
  onTabChange: (tab: "home" | "repair" | "profile") => void
  userType?: "technician" | "reporter"
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
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto">
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
              className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.id === "profile" ? (
                <Avatar className="w-5 h-5">
                  <AvatarImage src={userAvatar} alt="用户头像" />
                  <AvatarFallback>
                    <Icon className={`w-3 h-3 ${isActive ? "stroke-[2.5px]" : ""}`} />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : ""}`} />
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