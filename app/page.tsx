"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Dashboard from "@/components/dashboard";
import RepairPage from "@/components/repair-page";
import BottomNav from "@/components/bottom-nav";
import ProfilePage from "@/components/profile-page";
import ReporterProfile from "@/components/reporter-profile";
import AppSidebar from "@/components/app-sidebar";
import RecycleBinPage from "@/app/recycle-bin/page";
import { useAuth } from "@/context/auth-context";
import { UserRole, ROUTES } from "@/lib/enums";

// 有效的顶级标签列表，用于校验 URL 中的 tab 参数
const VALID_TABS = ["home", "repair", "profile", "recycle"] as const;
type TabType = typeof VALID_TABS[number];

function HomeContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 优先使用 URL 中的 tab 参数（例如从工单详情页"返回"时会带上 ?tab=repair），
  // 这样无论从哪个标签页进入详情页，返回后都能停留在原来的标签页，而不是被重置回首页
  const tabFromUrl = searchParams.get("tab");
  const initialTab: TabType = (VALID_TABS as readonly string[]).includes(tabFromUrl || "")
    ? (tabFromUrl as TabType)
    : "home";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 批次上下文：记住用户来自哪个批次工单
  const [batchContext, setBatchContext] = useState<{
    batchId: string;
    devices: any[];
  } | null>(null);

  // 在组件加载时检查用户角色并设置初始标签或重定向
  useEffect(() => {
    // 从 user context 获取用户角色（不再使用 localStorage）
    const role = user?.role as UserRole | undefined;
    if (role === UserRole.REPORTER) {
      setActiveTab("repair");
    } else if (role === UserRole.BUSINESS) {
      // 商务人员应该访问 /business 页面，而不是首页
      router.push(ROUTES.BUSINESS_DASHBOARD);
      return;
    } else if (role === UserRole.ADMIN) {
      // 管理员应该访问 /admin/users 页面
      router.push(ROUTES.ADMIN_USERS);
      return;
    } else if (role === UserRole.WAREHOUSE) {
      // 仓库管理员应该访问 /warehouse/dashboard 页面
      router.push(ROUTES.WAREHOUSE_DASHBOARD);
      return;
    } else if (!tabFromUrl) {
      // 只有在 URL 没有指定 tab 时才重置为首页，避免覆盖"返回"时携带的 tab 参数
      setActiveTab("home");
    }
    
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router]);

  // 切换标签时同步更新 URL（不产生新的历史记录），以便从详情页返回时能定位到正确的标签
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === "repair") {
      setSelectedTaskId(null);
    }
    router.replace(`/?tab=${tab}`, { scroll: false });
  };

  const handleStartRepair = (taskId: string, batchCtx?: { batchId: string; devices: any[] }) => {
    // 如果是"all"，则只切换到维修页面，不设置特定任务ID
    if (taskId === "all") {
      setSelectedTaskId(null);
      setBatchContext(null);
    } else {
      setSelectedTaskId(taskId);
      // 保存批次上下文（如果有）
      setBatchContext(batchCtx || null);
    }
    handleTabChange("repair");
  }

  const handleBackToDashboard = () => {
    // 如果有批次上下文，返回到批次选择（停留在维修工单页面但清除taskId）
    // 如果没有批次上下文，返回到首页
    if (batchContext) {
      setSelectedTaskId(null); // 清除选中的设备，但保持在维修工单页面
      // 不设置 handleTabChange("home")，保持在 repair 标签
    } else {
      setSelectedTaskId(null);
      setBatchContext(null);
      handleTabChange("home");
    }
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
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* 侧边栏 */}
      <AppSidebar 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        userType={user?.role}
      />
      
      {/* 主内容区 */}
      <div className="flex min-h-0 flex-1 flex-col md:ml-64">
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-20 md:pb-0">
          {activeTab === "home" && (
            <Dashboard onStartRepair={handleStartRepair} />
          )}
          {activeTab === "repair" && (
            <RepairPage 
              onBack={handleBackToDashboard} 
              userType={user?.role}
              taskId={selectedTaskId}
              batchContext={batchContext}
            />
          )}
        {activeTab === "profile" && (
          user?.role === UserRole.REPORTER ? <ReporterProfile /> : <ProfilePage />
        )}
        {activeTab === "recycle" && user?.role !== UserRole.REPORTER && (
          <RecycleBinPage />
        )}
      </main>
        
        <div className="md:hidden">
          <BottomNav 
            activeTab={activeTab} 
            onTabChange={handleTabChange} 
            userType={user?.role}
          />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">加载中...</div>}>
      <HomeContent />
    </Suspense>
  );
}
