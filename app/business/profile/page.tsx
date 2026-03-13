"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Phone, Save, Edit2, FileText } from "lucide-react";
import { useRepairContext } from "@/context/RepairContext";

export default function BusinessProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const { repairs } = useRepairContext();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editedUser, setEditedUser] = useState({
    realName: "",
    phone: "",
    avatar: "/placeholder-user.jpg"
  });

  // 获取当前用户的报告
  const userReports = repairs.filter(repair => {
    return repair.reportedBy === user?.realName || repair.reportedBy === user?.id;
  });

  useEffect(() => {
    if (user) {
      setEditedUser({
        realName: user.realName || "",
        phone: user.phone || "",
        avatar: user.avatar || "/placeholder-user.jpg"
      });
    }
  }, [user]);

  const handleLogout = () => {
    setIsLoading(true);
    setTimeout(() => {
      logout();
      setIsLoading(false);
    }, 1000);
  };

  const handleEditToggle = async () => {
    if (isEditing) {
      // 验证手机号格式
      if (editedUser.phone) {
        const phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(editedUser.phone)) {
          alert("手机号格式不正确，请输入11位有效手机号")
          return
        }
      }
      
      // 保存更改到数据库（通过 API）
      try {
        setIsLoading(true)
        const response = await fetch(`/api/users/${user?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            realName: editedUser.realName,
            phoneNumber: editedUser.phone,  // API 字段名为 phoneNumber
          }),
        })

        const result = await response.json()
        if (result.success) {
          // 刷新 AuthContext，使沟通记录和操作记录中的姓名同步更新
          await refreshUser()
          alert("个人信息更新成功")
          setIsEditing(false)
        } else {
          alert(result.message || "更新失败，请重试")
        }
      } catch (error) {
        console.error("更新用户信息失败:", error)
        alert("更新失败，请检查网络连接")
      } finally {
        setIsLoading(false)
      }
    } else {
      setIsEditing(true)
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">个人中心</h1>
          <p className="text-muted-foreground mt-2">
            管理您的个人信息和账户设置
          </p>
        </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 个人信息卡片 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              个人信息
            </CardTitle>
            <CardDescription>查看和编辑您的个人信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center py-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-12 w-12 text-primary" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="realName">真实姓名</Label>
                {isEditing ? (
                  <Input
                    id="realName"
                    value={editedUser.realName}
                    onChange={(e) => setEditedUser({ ...editedUser, realName: e.target.value })}
                    placeholder="请输入真实姓名"
                  />
                ) : (
                  <div className="px-3 py-2 bg-muted rounded-md">
                    {user?.realName || "未设置"}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">手机号</Label>
                {isEditing ? (
                  <Input
                    id="phone"
                    value={editedUser.phone}
                    onChange={(e) => setEditedUser({ ...editedUser, phone: e.target.value })}
                    placeholder="请输入手机号"
                  />
                ) : (
                  <div className="px-3 py-2 bg-muted rounded-md">
                    {user?.phone || "未设置"}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>用户ID</Label>
                <div className="px-3 py-2 bg-muted rounded-md">
                  {user?.id || "未知"}
                </div>
              </div>

              <div className="space-y-2">
                <Label>角色</Label>
                <div className="px-3 py-2 bg-muted rounded-md">
                  商务人员
                </div>
              </div>
            </div>

            <Separator />

            <Button
              onClick={handleEditToggle}
              disabled={isLoading}
              className="w-full"
              variant={isEditing ? "default" : "outline"}
            >
              {isEditing ? (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存更改
                </>
              ) : (
                <>
                  <Edit2 className="mr-2 h-4 w-4" />
                  编辑信息
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 统计信息卡片 */}
        <Card>
          <CardHeader>
            <CardTitle>统计信息</CardTitle>
            <CardDescription>您的账户相关统计</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">提交的工单数</p>
                  <p className="text-2xl font-bold">{userReports.length}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>

            {/* 退出登录按钮在商务侧边栏已经有，这里不再重复显示 */}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
