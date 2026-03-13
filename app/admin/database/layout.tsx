"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { UserRole } from "@/lib/enums";

export default function AdminDatabaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === "/admin/database/profile";
  const [isChecking, setIsChecking] = useState(true);
  const redirectingRef = useRef(false); // 防止重复重定向
  
  useEffect(() => {
    // 如果状态还在加载中，等待
    if (status === "loading") {
      setIsChecking(true);
      return;
    }
    
    // 未认证用户，等待 auth-context 处理重定向
    if (status === "unauthenticated") {
      setIsChecking(false);
      return;
    }
    
    // 已认证用户，检查权限
    if (status === "authenticated") {
      // 如果用户信息还没加载，继续等待
      if (!user) {
        setIsChecking(true);
        return;
      }
      
      // 用户信息已加载，检查权限
      setIsChecking(false);
      
      // 权限检查通过，允许访问
      // 如果角色不匹配，layout 会返回 null，不渲染内容
    }
  }, [status, user, router, pathname]);
  
  // 在权限检查期间显示加载状态
  if (isChecking || status === "loading" || (status === "authenticated" && !user)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">正在验证权限...</p>
        </div>
      </div>
    );
  }
  
  // 如果用户未认证，不渲染内容（auth-context 会处理重定向）
  if (status === "unauthenticated") {
    return null;
  }
  
  // 如果用户已认证但角色不匹配，不渲染内容
  if (status === "authenticated" && user && user.role !== UserRole.WAREHOUSE && user.role !== UserRole.ADMIN) {
    return null;
  }
  
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">
              {isProfilePage ? "个人信息" : "数据库管理"}
            </h1>
            {!isProfilePage && (
              <span className="text-sm text-muted-foreground">
                设备数据库和维修数据库管理
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {!isProfilePage && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => router.push("/admin/database/profile")}
                className="flex items-center gap-2"
              >
                <User className="h-4 w-4" />
                个人信息
              </Button>
            )}
            {isProfilePage && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => router.push("/admin/database")}
                className="flex items-center gap-2"
              >
                返回数据库管理
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {user?.realName} ({user?.role === UserRole.ADMIN ? "管理员" : "仓库管理员"})
            </span>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={logout}
              className="flex items-center gap-2 text-destructive hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </Button>
          </div>
        </div>
      </header>
      
      <main>
        {children}
      </main>
    </div>
  );
}