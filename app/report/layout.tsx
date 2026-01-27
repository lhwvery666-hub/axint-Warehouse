"use client";
import { useState, useEffect } from "react";
import BottomNav from "@/components/bottom-nav";
import ProfilePage from "@/components/profile-page";
import ReporterProfile from "@/components/reporter-profile";
import AppSidebar from "@/components/app-sidebar";
import { useAuth } from "@/context/auth-context";
import ReportPage from "./page";

export default function ReportLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { user, status } = useAuth();
  const [activeTab, setActiveTab] = useState<"home" | "repair" | "profile">("repair");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 在组件加载时检查用户角色
  useEffect(() => {
    // 等待用户信息加载完成
    if (status === "loading") {
      return; // 还在加载中，不执行任何操作
    }

    // 确保只有现场报告人员可以访问此页面
    // 只有在认证完成且角色不是 reporter 时才重定向
    if (status === "authenticated" && user?.role !== "reporter") {
      if (typeof window !== 'undefined') {
        window.location.href = "/";
      }
    }
  }, [user, status]);

  // 如果正在加载用户信息，显示加载指示器
  if (status === "loading") {
    return <div className="flex items-center justify-center h-screen">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* 侧边栏 */}
      <AppSidebar 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab);
          // 当从侧边栏点击"维修工单"时，清除选中的工单ID
          if (tab === "repair") {
            setSelectedTaskId(null);
          }
        }} 
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