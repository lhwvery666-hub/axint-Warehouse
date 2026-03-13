"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UserRole } from "@/lib/enums";

export default function TechnicianTasks() {
  const { user, status } = useAuth();
  const router = useRouter();

  // 重定向到首页，因为维修人员的主要功能在首页
  useEffect(() => {
    if (status === "authenticated" && user?.role === UserRole.TECHNICIAN) {
      router.push("/");
    }
  }, [status, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">正在跳转...</p>
      </div>
    </div>
  );
}
