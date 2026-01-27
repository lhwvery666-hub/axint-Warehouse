"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function AdminUsersProfileLayout({
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
    
    if (user?.role !== "admin") {
      router.push("/login");
      return;
    }
  }, [status, user, router]);
  
  return <>{children}</>;
}
