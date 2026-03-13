"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import ProfilePage from "@/components/profile-page";
import ReporterProfile from "@/components/reporter-profile";
import AppSidebar from "@/components/app-sidebar";
import { useAuth } from "@/context/auth-context";
import { UserRole } from "@/lib/enums";
import ReportPage from "./page";

export default function ReportLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  // 检查是否是批次详情页面（需要全屏显示，无侧边栏）
  const isBatchDetailPage = pathname?.includes('/batch/');
  
  // 现场人员页面默认显示 repair 标签页，没有 home 页面
  const [activeTab, setActiveTab] = useState<"home" | "repair" | "profile">("repair");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // 处理标签切换（现场人员没有 home，将 home 重定向到 repair）
  const handleTabChange = (tab: "home" | "repair" | "profile" | "recycle") => {
    if (tab === "home") {
      // 现场人员点击 logo 时，保持在 repair 页面
      setActiveTab("repair");
    } else {
      setActiveTab(tab as "home" | "repair" | "profile");
    }
  };

  // 在组件加载时检查用户角色
  useEffect(() => {
    // 等待用户信息加载完成
    if (status === "loading") {
      return; // 还在加载中，不执行任何操作
    }

    // 确保只有现场报告人员可以访问此页面
    // 只有在认证完成且角色不是 reporter 时才重定向
    if (status === "authenticated" && user?.role !== UserRole.REPORTER) {
      router.push("/");
    }
  }, [user, status]);

  // 如果正在加载用户信息，显示加载指示器
  if (status === "loading") {
    return <div className="flex items-center justify-center h-screen">加载中...</div>;
  }

  // 批次详情页面：全屏显示，无侧边栏
  if (isBatchDetailPage) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }

  // 普通页面：带侧边栏
  return (
    <div className="min-h-screen bg-background flex">
      {/* 侧边栏 */}
      <AppSidebar 
        activeTab={activeTab} 
        onTabChange={handleTabChange}
        userType="reporter"
      />
      
      {/* 主内容区 */}
      <div className="flex flex-col flex-1 md:ml-64">
        <main className="flex-1 overflow-auto">
          {activeTab === "repair" && children}
          {activeTab === "profile" && <ReporterProfile />}
        </main>
        
        <div className="md:hidden">
          <BottomNav 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            userType="reporter"
          />
        </div>
      </div>
    </div>
  );
}