"use client";

import { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Plus, Trash2, Edit, Users, RefreshCw, Loader2, Search, Filter } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserRole, normalizeUserRole, USER_ROLE_LABELS } from "@/lib/enums";

// 用户账户类型定义
type UserAccount = {
  id: string;
  username: string;
  realName: string;
  phoneNumber?: string;
  role?: string; // Admin, Technician, Warehouse, Reporter, User
  createdAt?: string;
  updatedAt?: string;
};

export default function UserManager() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 搜索和筛选状态
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // 加载所有用户数据
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/users', {
        cache: 'no-store',
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // 转换角色格式（数据库中的 Admin -> 前端显示）
          const formattedUsers = result.data.map((user: any) => ({
            id: user.id,
            username: user.username,
            realName: user.realName,
            phoneNumber: user.phoneNumber || "",
            role: user.role || undefined,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          }));
          setUsers(formattedUsers);
        } else {
          setError(result.message || "加载用户列表失败");
        }
      } else {
        setError("加载用户列表失败");
      }
    } catch (error) {
      console.error("加载用户数据失败:", error);
      setError("加载用户数据失败，请检查网络连接");
    } finally {
      setIsLoading(false);
    }
  };

  // 用户管理
  const handleAddUser = () => {
    setEditingUser({
      id: "",
      username: "",
      realName: "",
      phoneNumber: "",
      role: undefined,
    });
    setNewPassword("");
    setIsAddingNew(true);
    setIsDialogOpen(true);
    setError("");
  };

  const handleEditUser = (user: UserAccount) => {
    setEditingUser({ ...user });
    setNewPassword("");
    setIsAddingNew(false);
    setIsDialogOpen(true);
    setError("");
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    setIsSaving(true);
    setError("");

    try {
      // 验证必填字段
      if (!editingUser.username || !editingUser.realName) {
        setError("用户名和姓名为必填项");
        setIsSaving(false);
        return;
      }

      // 验证手机号格式（如果提供了）
      if (editingUser.phoneNumber) {
        const phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(editingUser.phoneNumber)) {
          setError("手机号格式不正确，请输入11位有效手机号")
          setIsSaving(false)
          return
        }
      }

      if (isAddingNew) {
        // 创建新用户
        if (!newPassword) {
          setError("新用户必须设置密码");
          setIsSaving(false);
          return;
        }

        const response = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: editingUser.username,
            password: newPassword,
            realName: editingUser.realName,
            phoneNumber: editingUser.phoneNumber || null,
            role: editingUser.role || null,
          }),
        });

        const result = await response.json();
        if (result.success) {
          setIsDialogOpen(false);
          loadUsers();
        } else {
          setError(result.message || "创建用户失败");
        }
      } else {
        // 更新用户
        const updateData: any = {
          realName: editingUser.realName,
          phoneNumber: editingUser.phoneNumber || null,
          role: editingUser.role || null,
        };

        // 如果输入了新密码，则更新密码
        if (newPassword) {
          updateData.password = newPassword;
        }

        const response = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });

        const result = await response.json();
        if (result.success) {
          setIsDialogOpen(false);
          loadUsers();
        } else {
          setError(result.message || "更新用户失败");
        }
      }
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`确定要注销用户 "${username}" 吗？注销后该账号将无法登录，但历史工单中的姓名和手机号会被保留。`)) return;

    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (result.success) {
        loadUsers();
      } else {
        alert(result.message || "注销用户失败");
      }
    } catch (error: any) {
      alert(`注销用户失败: ${error.message}`);
    }
  };

  // 获取角色显示名称
  const getRoleName = (role?: string) => {
    if (!role) return '未授权';
    const normalizedRole = normalizeUserRole(role);
    return normalizedRole ? USER_ROLE_LABELS[normalizedRole] : role;
  };

  // 获取角色显示样式
  const getRoleBadge = (role?: string) => {
    if (!role) {
      return <span className="inline-flex items-center px-2 py-1 rounded-md bg-warning/10 text-warning text-xs font-medium">未授权</span>;
    }
    const styles: Record<string, string> = {
      'Admin': 'bg-primary/10 text-primary',
      'Technician': 'bg-blue-100 text-blue-700',
      'Warehouse': 'bg-green-100 text-green-700',
      'Reporter': 'bg-purple-100 text-purple-700',
      'Business': 'bg-orange-100 text-orange-700',
      '商务': 'bg-orange-100 text-orange-700',
      '商务人员': 'bg-orange-100 text-orange-700',
      '商务管理员': 'bg-orange-100 text-orange-700',
    };
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${styles[role] || 'bg-muted text-muted-foreground'}`}>
        {getRoleName(role)}
      </span>
    );
  };

  // 筛选和搜索逻辑
  const filteredUsers = users.filter((user) => {
    // 角色筛选
    if (roleFilter !== "all") {
      const normalizedUserRole = normalizeUserRole(user.role);
      const normalizedFilterRole = normalizeUserRole(roleFilter);
      
      if (normalizedFilterRole && normalizedUserRole !== normalizedFilterRole) {
        return false;
      }
    }
    
    // 搜索筛选（用户名、姓名、手机号）
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        user.username.toLowerCase().includes(query) ||
        user.realName.toLowerCase().includes(query) ||
        (user.phoneNumber && user.phoneNumber.includes(query))
      );
    }
    
    return true;
  });

  // 统计各角色用户数量
  const roleStats = {
    total: users.length,
    admin: users.filter(u => normalizeUserRole(u.role) === UserRole.ADMIN).length,
    technician: users.filter(u => normalizeUserRole(u.role) === UserRole.TECHNICIAN).length,
    warehouse: users.filter(u => normalizeUserRole(u.role) === UserRole.WAREHOUSE).length,
    reporter: users.filter(u => normalizeUserRole(u.role) === UserRole.REPORTER).length,
    business: users.filter(u => normalizeUserRole(u.role) === UserRole.BUSINESS).length,
    unassigned: users.filter(u => !u.role).length,
  };

  return (
    <div className="space-y-6 bg-gradient-to-br from-background via-background to-primary/5 dark:from-background dark:via-background dark:to-primary/10 min-h-screen p-4 md:p-6">
      <Card className="border-border/50 dark:border-border shadow-lg bg-card dark:bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            用户管理
          </CardTitle>
          <CardDescription className="text-base mt-2">
            管理所有用户账号，包括人员录入和权限设置。所有数据存储在 SQL Server 数据库中，密码已加密存储。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 统计信息 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">{roleStats.total}</div>
              <div className="text-xs text-muted-foreground mt-1">总用户数</div>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">{roleStats.admin}</div>
              <div className="text-xs text-muted-foreground mt-1">管理员</div>
            </div>
            <div className="bg-blue-100/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{roleStats.technician}</div>
              <div className="text-xs text-muted-foreground mt-1">维修工程师</div>
            </div>
            <div className="bg-green-100/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{roleStats.warehouse}</div>
              <div className="text-xs text-muted-foreground mt-1">仓库管理员</div>
            </div>
            <div className="bg-purple-100/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">{roleStats.reporter}</div>
              <div className="text-xs text-muted-foreground mt-1">现场报告人员</div>
            </div>
            <div className="bg-orange-100/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-orange-700">{roleStats.business}</div>
              <div className="text-xs text-muted-foreground mt-1">商务人员</div>
            </div>
            <div className="bg-warning/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-warning">{roleStats.unassigned}</div>
              <div className="text-xs text-muted-foreground mt-1">未授权</div>
            </div>
          </div>

          {/* 搜索和筛选栏 */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户名、姓名或手机号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="筛选角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  <SelectItem value="Admin">管理员</SelectItem>
                  <SelectItem value="Technician">维修工程师</SelectItem>
                  <SelectItem value="Warehouse">仓库管理员</SelectItem>
                  <SelectItem value="Reporter">现场报告人员</SelectItem>
                  <SelectItem value="Business">商务人员</SelectItem>
                  <SelectItem value="none">未授权</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadUsers} variant="ghost" className="flex items-center gap-2" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
              <Button onClick={handleAddUser} className="flex items-center gap-2 shadow-md hover:shadow-lg transition-all">
                <Plus className="h-4 w-4" />
                添加用户
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              用户账号列表
              {filteredUsers.length !== users.length && (
                <span className="text-sm text-muted-foreground font-normal ml-2">
                  (显示 {filteredUsers.length} / {users.length})
                </span>
              )}
            </h3>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/50 dark:border-border bg-background dark:bg-background">
              {filteredUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 dark:bg-muted">
                      <TableHead className="font-semibold">ID</TableHead>
                      <TableHead className="font-semibold">用户名</TableHead>
                      <TableHead className="font-semibold">姓名</TableHead>
                      <TableHead className="font-semibold">手机号</TableHead>
                      <TableHead className="font-semibold">角色</TableHead>
                      <TableHead className="font-semibold">创建时间</TableHead>
                      <TableHead className="text-right font-semibold">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user, index) => (
                      <TableRow key={user.id} className={index % 2 === 0 ? "bg-background dark:bg-background" : "bg-muted/20 dark:bg-muted/30 hover:bg-muted/40 dark:hover:bg-muted/50 transition-colors"}>
                        <TableCell className="font-mono text-xs">{user.id}</TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.realName}</TableCell>
                        <TableCell>{user.phoneNumber || "-"}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEditUser(user)} className="hover:bg-primary/10">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(user.id, user.username)} className="hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  {searchQuery || roleFilter !== "all" ? (
                    <>
                      <p className="text-muted-foreground font-medium">未找到匹配的用户</p>
                      <p className="text-sm text-muted-foreground mt-1">请尝试调整搜索条件或筛选条件</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchQuery("");
                          setRoleFilter("all");
                        }}
                        className="mt-4"
                      >
                        清除筛选
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground font-medium">暂无用户数据</p>
                      <p className="text-sm text-muted-foreground mt-1">可点击"添加用户"进行配置</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 编辑用户对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {isAddingNew ? "添加用户" : "编辑用户"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1 pr-2">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {editingUser && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="userUsername">用户名 *</Label>
                <Input
                  id="userUsername"
                  value={editingUser.username}
                  onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                  placeholder="登录用户名，如 admin、tech01"
                  disabled={!isAddingNew}
                />
                {!isAddingNew && (
                  <p className="text-xs text-muted-foreground">用户名不可修改</p>
                )}
              </div>
              {isAddingNew && (
                <div className="space-y-2">
                  <Label htmlFor="userPassword">密码 *</Label>
                  <Input
                    id="userPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="登录密码（将加密存储）"
                  />
                </div>
              )}
              {!isAddingNew && (
                <div className="space-y-2">
                  <Label htmlFor="userPasswordReset">重置密码（可选）</Label>
                  <Input
                    id="userPasswordReset"
                    type="password"
                    value={newPassword}
                    placeholder="留空则不修改密码，输入新密码则重置"
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">出于安全考虑，密码不可查看。如需修改，请输入新密码；留空则保持原密码不变。</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="userRealName">姓名（实名） *</Label>
                <Input
                  id="userRealName"
                  value={editingUser.realName}
                  onChange={(e) => setEditingUser({ ...editingUser, realName: e.target.value })}
                  placeholder="如：张三、李仓管"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userPhoneNumber">手机号（选填）</Label>
                <Input
                  id="userPhoneNumber"
                  type="tel"
                  value={editingUser.phoneNumber || ""}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '') // 只允许数字
                    setEditingUser({ ...editingUser, phoneNumber: value })
                  }}
                  placeholder="请输入11位手机号"
                  maxLength={11}
                />
                {editingUser.phoneNumber && !/^1[3-9]\d{9}$/.test(editingUser.phoneNumber) && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    手机号格式不正确
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="userRole">角色 *</Label>
                <Select
                  value={editingUser.role || "none"}
                  onValueChange={(value: string) =>
                    setEditingUser({ ...editingUser, role: value === "none" ? undefined : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未授权（待授予角色）</SelectItem>
                    <SelectItem value="Admin">管理员</SelectItem>
                    <SelectItem value="Technician">维修工程师</SelectItem>
                    <SelectItem value="Warehouse">仓库管理员</SelectItem>
                    <SelectItem value="Reporter">现场报告人员</SelectItem>
                    <SelectItem value="Business">商务人员</SelectItem>
                    <SelectItem value="User">普通员工</SelectItem>
                  </SelectContent>
                </Select>
                {!editingUser.role && (
                  <p className="text-xs text-warning">此用户尚未被授予角色，无法登录系统</p>
                )}
              </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>取消</Button>
            <Button onClick={handleSaveUser} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
