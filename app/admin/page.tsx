"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { UserRole } from "@/lib/enums";

export default function AdminDashboard() {
  const { user, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated" || user?.role !== UserRole.ADMIN) {
      router.push("/login");
      return;
    }
    
    // 直接重定向到用户管理页面
    router.push("/admin/users");
  }, [status, user, router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">跳转中...</h1>
        <p className="text-muted-foreground">正在跳转到用户管理页面</p>
      </div>
    </div>
  );
}
