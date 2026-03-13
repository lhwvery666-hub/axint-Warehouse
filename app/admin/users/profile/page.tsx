"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { UserRole } from "@/lib/enums";
import AdminProfile from "@/components/admin-profile";

export default function AdminUsersProfilePage() {
  const { user, status } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    
    if (user?.role !== UserRole.ADMIN) {
      router.push("/login");
      return;
    }
    
    setIsAuthorized(true);
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
