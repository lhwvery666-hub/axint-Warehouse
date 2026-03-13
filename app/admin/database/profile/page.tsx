"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { UserRole } from "@/lib/enums";
import AdminProfile from "@/components/admin-profile";

export default function AdminDatabaseProfilePage() {
  const { user, status } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    
    // 只有在用户信息已加载且角色不匹配时才重定向
    // 避免在用户信息加载过程中误判
    if (user && user.role !== UserRole.WAREHOUSE && user.role !== UserRole.ADMIN) {
      console.warn(`用户 ${user.realName} (角色: ${user.role}) 无权访问数据库管理页面`)
      router.push("/login");
      return;
    }
    
    // 如果用户信息已加载且角色匹配，设置授权状态
    if (user && (user.role === UserRole.WAREHOUSE || user.role === UserRole.ADMIN)) {
      setIsAuthorized(true);
    }
  }, [status, user, router]);
  
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
  
  return <AdminProfile />;
}
