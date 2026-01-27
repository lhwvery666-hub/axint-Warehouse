"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/dashboard";
import RepairPage from "@/components/repair-page";
import BottomNav from "@/components/bottom-nav";
import ProfilePage from "@/components/profile-page";
import ReporterProfile from "@/components/reporter-profile";
import AppSidebar from "@/components/app-sidebar";
import { useAuth } from "@/context/auth-context";

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"home" | "repair" | "profile">("home");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 在组件加载时检查用户角色并设置初始标签或重定向
  useEffect(() => {
    // 从 user context 获取用户角色（不再使用 localStorage）
    if (user?.role === "reporter") {
      setActiveTab("repair");
    } else if (user?.role === "business") {
      // 商务人员应该访问 /business 页面，而不是首页
      router.push("/business");
      return;
    } else if (user?.role === "admin") {
      // 管理员应该访问 /admin/users 页面
      router.push("/admin/users");
      return;
    } else if (user?.role === "warehouse") {
      // 仓库管理员应该访问 /warehouse/dashboard 页面
      router.push("/warehouse/dashboard");
      return;
    } else {
      setActiveTab("home");
    }
    
    setIsLoading(false);
  }, [user, router]);

  const handleStartRepair = (taskId: string) => {
    // 如果是"all"，则只切换到维修页面，不设置特定任务ID
    if (taskId === "all") {
      setSelectedTaskId(null);
    } else {
      setSelectedTaskId(taskId);
    }
    setActiveTab("repair");
  }

  const handleBackToDashboard = () => {
    setSelectedTaskId(null);
    setActiveTab("home");
  }

  // 如果正在加载，显示加载指示器
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">加载中...</div>;
  }

  // 如果没有用户或用户角色无效，显示提示
  if (!user || !user.role) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4 p-8">
          <h2 className="text-2xl font-bold">未授权访问</h2>
          <p className="text-muted-foreground">
            您的账号尚未被授权，请联系管理员为您分配角色。
          </p>
          <p className="text-sm text-muted-foreground">
            新注册的用户默认角色为"普通员工"，需要管理员在"用户管理"页面将您的角色修改为"维修工程师"、"现场报告人员"等才能使用系统。
          </p>
        </div>
      </div>
    );
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
        userType={user?.role}
      />
      
      {/* 主内容区 */}
      <div className="flex flex-col flex-1 md:ml-64">
        <main className="flex-1 overflow-auto">
          {activeTab === "home" && (
            <Dashboard onStartRepair={handleStartRepair} />
          )}
          {activeTab === "repair" && (
            <RepairPage 
              onBack={handleBackToDashboard} 
              userType={user?.role}
              taskId={selectedTaskId}
            />
          )}
        {activeTab === "profile" && (
          user?.role === "reporter" ? <ReporterProfile /> : <ProfilePage />
        )}
      </main>
        
        <div className="md:hidden">
          <BottomNav 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            userType={user?.role}
          />
        </div>
      </div>
    </div>
  );
}