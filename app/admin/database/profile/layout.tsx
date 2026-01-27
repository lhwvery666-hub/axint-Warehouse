"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function AdminDatabaseProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, status } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    
    // 只有在用户信息已加载且角色不匹配时才重定向
    // 避免在用户信息加载过程中误判
    if (user && user.role !== "warehouse" && user.role !== "admin") {
      console.warn(`用户 ${user.realName} (角色: ${user.role}) 无权访问数据库管理页面`)
      router.push("/login");
      return;
    }
  }, [status, user, router]);
  
  return <>{children}</>;
}
