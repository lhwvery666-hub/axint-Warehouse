"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import UserManager from "@/components/admin/user-manager";

export default function AdminUsersPage() {
  const { user, status } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  
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
  
  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6">
        <UserManager />
      </div>
    </div>
  );
}
