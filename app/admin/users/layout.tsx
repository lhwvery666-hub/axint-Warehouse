"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Users, User, LogOut } from "lucide-react";

export default function AdminUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === "/admin/users/profile";
  
  useEffect(() => {
    // 如果状态还在加载中，不做任何处理
    if (status === "loading") return;
    
    // 只允许管理员访问
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    
    if (user?.role !== "admin") {
      router.push("/login");
      return;
    }
  }, [status, user, router]);
  
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <h1 className="text-xl font-bold">
                {isProfilePage ? "个人信息" : "用户管理"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {!isProfilePage && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => router.push("/admin/users/profile")}
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
                onClick={() => router.push("/admin/users")}
                className="flex items-center gap-2"
              >
                返回用户管理
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {user?.realName} (管理员)
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
