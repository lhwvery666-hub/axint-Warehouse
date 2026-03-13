"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  FileText, 
  LogOut, 
  User,
  Menu,
  X
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { UserRole } from "@/lib/enums";

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  useEffect(() => {
    // 如果状态还在加载中，不做任何处理
    if (status === "loading") return;
    
    // 只允许商务人员访问
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    
    if (user?.role !== UserRole.BUSINESS) {
      router.push("/login");
      return;
    }
    
    // 权限验证通过
    setIsAuthorized(true);
  }, [status, user, router]);

  // 如果还在加载或未授权，显示加载状态
  if (status === "loading" || !isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">加载中...</h1>
          <p className="text-muted-foreground">请稍候，正在验证您的权限。</p>
        </div>
      </div>
    );
  }


  const menuItems = [
    {
      title: "管理控制台",
      icon: LayoutDashboard,
      href: "/business",
      description: "系统管理概览",
      onClick: undefined
    },
    {
      title: "工单管理",
      icon: FileText,
      href: "/business/repairs",
      description: "查看和管理所有维修工单",
      onClick: undefined
    },
    {
      title: "个人中心",
      icon: User,
      href: "/business/profile",
      description: "个人信息和设置",
      onClick: undefined
    }
  ];

  const isActive = (href: string) => {
    if (href === "/business") {
      return pathname === "/business";
    }
    return pathname?.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* 侧边栏 - 固定定位 */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen border-r border-border bg-card transition-all duration-300 z-40 overflow-y-auto",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="flex flex-col h-full">
          {/* 侧边栏头部 */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className={cn("flex items-center gap-2", !sidebarOpen && "justify-center")}>
              {sidebarOpen ? (
                <>
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <span className="text-primary-foreground font-bold text-lg">N</span>
                  </div>
                  <span className="font-bold text-lg">智能维修系统</span>
                </>
              ) : (
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-lg">N</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8"
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const Component = item.onClick ? "button" : Link;
              const props = item.onClick
                ? { onClick: item.onClick }
                : { href: item.href };
              
              return (
                <Component
                  key={item.href}
                  {...props}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full text-left",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{item.title}</div>
                      {sidebarOpen && (
                        <div className="text-xs opacity-70 truncate">{item.description}</div>
                      )}
                    </div>
                  )}
                </Component>
              );
            })}
          </nav>

          {/* 用户信息 */}
          <div className="p-4 border-t border-border">
            <div className={cn("flex items-center gap-3", !sidebarOpen && "justify-center")}>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{user?.realName || "商务人员"}</div>
                  <div className="text-xs text-muted-foreground">商务人员</div>
                  {user?.id && (
                    <div className="text-xs text-muted-foreground/70 mt-0.5">
                      ID: {user.id}
                    </div>
                  )}
                </div>
              )}
            </div>
            {sidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="w-full mt-2 text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                退出登录
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* 主内容区 - 添加左边距以适配固定侧边栏 */}
      <main className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300",
        sidebarOpen ? "ml-64" : "ml-20"
      )}>
        {children}
      </main>
    </div>
  );
}
