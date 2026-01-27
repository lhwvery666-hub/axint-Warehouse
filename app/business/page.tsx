"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  FileText, 
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { useRepairContext } from "@/context/RepairContext";

// 创建一个全局事件来打开工单管理面板
declare global {
  interface Window {
    openRepairsPanel?: (status?: string) => void;
  }
}

export default function BusinessDashboard() {
  const { user, status } = useAuth();
  const router = useRouter();
  const { repairs } = useRepairContext();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTickets: 0,
    pendingTickets: 0,
    completedTickets: 0,
    inRepairTickets: 0,
    adminReviewTickets: 0
  });

  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated" || user?.role !== "business") {
      router.push("/login");
      return;
    }
    
    setIsAuthorized(true);
  }, [status, user, router]);

  // 加载统计数据
  useEffect(() => {
    if (!isAuthorized) return;

    // 加载用户数量
    fetch("/api/users")
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setStats(prev => ({ ...prev, totalUsers: data.data.length }));
        }
      })
      .catch(err => console.error("加载用户统计失败:", err));

    // 从 RepairContext 获取工单统计
    if (repairs && Array.isArray(repairs)) {
      const totalTickets = repairs.length;
      const pendingTickets = repairs.filter(r => 
        r.status === "created" || r.status === "pending"
      ).length;
      const inRepairTickets = repairs.filter(r => 
        r.status === "in_repair" || r.status === "processing"
      ).length;
      const adminReviewTickets = repairs.filter(r => 
        r.status === "admin_review"
      ).length;
      const completedTickets = repairs.filter(r => 
        r.status === "completed"
      ).length;

      setStats(prev => ({
        ...prev,
        totalTickets,
        pendingTickets,
        inRepairTickets,
        adminReviewTickets,
        completedTickets
      }));
    }
  }, [isAuthorized, repairs]);

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

  const pendingShipmentTickets = repairs?.filter(r => 
    r.status === "pending_shipment" || r.status === "Pending_Shipment"
  ).length || 0;

  const quickActions = [
    {
      title: "待商务处理",
      description: `查看 ${stats.adminReviewTickets} 个待审核的工单`,
      icon: AlertCircle,
      href: "/repairs?status=admin_review",
      color: "text-purple-600",
      bgColor: "bg-purple-50 dark:bg-purple-950/20",
      borderColor: "border-purple-200 dark:border-purple-800",
      count: stats.adminReviewTickets,
      priority: stats.adminReviewTickets > 0
    },
    {
      title: "工单管理",
      description: "查看和管理所有维修工单",
      icon: FileText,
      href: "/repairs",
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/20",
      borderColor: "border-blue-200 dark:border-blue-800"
    },
    {
      title: "待发货工单",
      description: `查看 ${pendingShipmentTickets} 个待发货的工单`,
      icon: Package,
      href: "/repairs?status=pending_shipment",
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950/20",
      borderColor: "border-orange-200 dark:border-orange-800",
      count: pendingShipmentTickets
    }
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6 space-y-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">商务管理控制台</h1>
            <p className="text-muted-foreground mt-2">
              欢迎回来，{user?.realName || "商务人员"}！这里是您的工单管理概览。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            刷新数据
          </Button>
        </div>

        {/* 重点关注的统计卡片 - 待商务处理 */}
        {stats.adminReviewTickets > 0 && (
          <Card className={`border-2 ${quickActions[0].borderColor} ${quickActions[0].bgColor}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${quickActions[0].bgColor}`}>
                    <AlertCircle className={`h-8 w-8 ${quickActions[0].color}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">有待处理的工单</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      您有 <span className="font-bold text-purple-600">{stats.adminReviewTickets}</span> 个工单等待您的审核和处理
                    </p>
                  </div>
                </div>
                <Button 
                  className="flex items-center gap-2"
                  onClick={() => handleOpenRepairsPanel("admin_review")}
                >
                  立即处理
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 核心统计卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待商务处理</CardTitle>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <AlertCircle className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats.adminReviewTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">等待审核的工单</p>
              {stats.adminReviewTickets > 0 && (
                <button
                  onClick={() => handleOpenRepairsPanel("admin_review")}
                  className="text-xs text-purple-600 hover:underline mt-2 inline-block"
                >
                  查看详情 →
                </button>
              )}
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待发货</CardTitle>
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Package className="h-4 w-4 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{pendingShipmentTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">等待发货的工单</p>
              {pendingShipmentTickets > 0 && (
                <button
                  onClick={() => handleOpenRepairsPanel("pending_shipment")}
                  className="text-xs text-orange-600 hover:underline mt-2 inline-block"
                >
                  查看详情 →
                </button>
              )}
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总工单数</CardTitle>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">所有工单</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已完成</CardTitle>
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.completedTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">已完成工单</p>
            </CardContent>
          </Card>
        </div>

        {/* 其他状态统计 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                待处理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pendingTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">待处理工单</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                维修中
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.inRepairTickets}</div>
              <p className="text-xs text-muted-foreground mt-1">正在维修的工单</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                总用户数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">已注册用户</p>
            </CardContent>
          </Card>
        </div>

        {/* 快速操作 */}
        <div>
          <h2 className="text-xl font-semibold mb-4">快速操作</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Card
                  key={index}
                  onClick={action.onClick}
                  className={`hover:shadow-lg transition-all cursor-pointer border-2 ${action.borderColor} ${action.priority ? action.bgColor : ''} hover:scale-[1.02]`}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${action.color}`} />
                        {action.title}
                      </div>
                      {action.count !== undefined && action.count > 0 && (
                        <span className={`text-xs px-2 py-1 rounded-full ${action.bgColor} ${action.color} font-semibold`}>
                          {action.count}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>{action.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-sm text-primary hover:underline">
                      立即前往
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
