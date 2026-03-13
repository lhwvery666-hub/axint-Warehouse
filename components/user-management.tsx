"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, Trash2, Search, UserCog, Shield, Eye, EyeOff } from "lucide-react"
import { UserRole, normalizeUserRole, USER_ROLE_LABELS } from "@/lib/enums"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"

interface User {
  id: string
  username: string
  role: string
  realName: string
  phoneNumber?: string
  createdAt?: string
  updatedAt?: string
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    realName: "",
    role: "Reporter",
    phoneNumber: ""
  })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/users")
      const result = await response.json()

      if (result.success) {
        setUsers(result.data || [])
      } else {
        toast.error(result.message || "获取用户列表失败")
      }
    } catch (error) {
      console.error("获取用户列表失败:", error)
      toast.error("获取用户列表失败")
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      username: "",
      password: "",
      realName: "",
      role: "Reporter",
      phoneNumber: ""
    })
    setShowPassword(false)
  }

  const handleOpenAdd = () => {
    resetForm()
    setIsAddDialogOpen(true)
  }

  const handleOpenEdit = (user: User) => {
    setSelectedUser(user)
    setFormData({
      username: user.username,
      password: "",
      realName: user.realName,
      role: user.role,
      phoneNumber: user.phoneNumber || ""
    })
    setShowPassword(false)
    setIsEditDialogOpen(true)
  }

  const handleAddUser = async () => {
    if (!formData.username || !formData.password || !formData.realName) {
      toast.error("用户名、密码和真实姓名为必填项")
      return
    }

    if (formData.password.length < 6) {
      toast.error("密码长度不能少于6位")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/users", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          realName: formData.realName,
          role: formData.role,
          phoneNumber: formData.phoneNumber || null
        })
      })

      const result = await response.json()
      if (result.success) {
        toast.success("用户创建成功")
        setIsAddDialogOpen(false)
        resetForm()
        fetchUsers()
      } else {
        toast.error(result.message || "创建失败")
      }
    } catch (error) {
      console.error("创建用户失败:", error)
      toast.error("创建失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditUser = async () => {
    if (!selectedUser || !formData.username || !formData.realName) {
      toast.error("用户名和真实姓名为必填项")
      return
    }

    if (formData.password && formData.password.length < 6) {
      toast.error("密码长度不能少于6位")
      return
    }

    setIsSubmitting(true)
    try {
      const updateData: any = {
        username: formData.username,
        realName: formData.realName,
        role: formData.role,
        phoneNumber: formData.phoneNumber || null
      }

      if (formData.password) {
        updateData.password = formData.password
      }

      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      const result = await response.json()
      if (result.success) {
        toast.success("用户信息已更新")
        setIsEditDialogOpen(false)
        setSelectedUser(null)
        resetForm()
        fetchUsers()
      } else {
        toast.error(result.message || "更新失败")
      }
    } catch (error) {
      console.error("更新用户失败:", error)
      toast.error("更新失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`确定要删除用户 ${user.realName} (${user.username}) 吗？\n\n此操作为软删除，用户将被标记为已删除，历史数据仍会保留。`)) {
      return
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE'
      })

      const result = await response.json()
      if (result.success) {
        toast.success("用户已删除")
        fetchUsers()
      } else {
        toast.error(result.message || "删除失败")
      }
    } catch (error) {
      console.error("删除用户失败:", error)
      toast.error("删除失败，请重试")
    }
  }

  const getRoleBadge = (role: string) => {
    const normalizedRole = normalizeUserRole(role);
    const label = normalizedRole ? USER_ROLE_LABELS[normalizedRole] : role;
    
    const classNameMap: Record<UserRole, string> = {
      [UserRole.ADMIN]: "bg-red-100 text-red-800",
      [UserRole.TECHNICIAN]: "bg-blue-100 text-blue-800",
      [UserRole.WAREHOUSE]: "bg-green-100 text-green-800",
      [UserRole.REPORTER]: "bg-purple-100 text-purple-800",
      [UserRole.BUSINESS]: "bg-yellow-100 text-yellow-800",
    };
    
    const className = normalizedRole ? classNameMap[normalizedRole] : "bg-gray-100 text-gray-800";
    const roleInfo = { label, className }

    return (
      <Badge variant="outline" className={roleInfo.className}>
        {roleInfo.label}
      </Badge>
    )
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.realName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phoneNumber && user.phoneNumber.includes(searchTerm))
    
    const matchesRole = roleFilter === "all" || user.role.toLowerCase() === roleFilter.toLowerCase()
    
    return matchesSearch && matchesRole
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="w-6 h-6" />
            用户管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理系统用户账号和权限
          </p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="w-4 h-4 mr-2" />
          添加用户
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索用户名、姓名或手机号..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="筛选角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有角色</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="technician">维修人员</SelectItem>
                <SelectItem value="warehouse">仓库管理员</SelectItem>
                <SelectItem value="reporter">现场人员</SelectItem>
                <SelectItem value="business">商务人员</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardHeader>
          <CardTitle>用户列表 ({filteredUsers.length})</CardTitle>
          <CardDescription>
            共 {users.length} 个用户账号
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>真实姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono font-medium">{user.username}</TableCell>
                      <TableCell>{user.realName}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {user.phoneNumber || <span className="text-muted-foreground">未填写</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.createdAt ? format(new Date(user.createdAt), "yyyy-MM-dd HH:mm", { locale: zhCN }) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(user)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {user.role.toLowerCase() !== "admin" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUser(user)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchTerm || roleFilter !== "all" ? "未找到匹配的用户" : "暂无用户"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 添加用户对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
            <DialogDescription>创建新的系统用户账号</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-username">用户名 *</Label>
              <Input
                id="add-username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入用户名（用于登录）"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-password">密码 *</Label>
              <div className="relative">
                <Input
                  id="add-password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="请输入密码（至少6位）"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-realName">真实姓名 *</Label>
              <Input
                id="add-realName"
                value={formData.realName}
                onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                placeholder="请输入真实姓名"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-role">用户角色 *</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Reporter">现场人员</SelectItem>
                  <SelectItem value="Technician">维修人员</SelectItem>
                  <SelectItem value="Warehouse">仓库管理员</SelectItem>
                  <SelectItem value="Business">商务人员</SelectItem>
                  <SelectItem value="Admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-phoneNumber">手机号</Label>
              <Input
                id="add-phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                placeholder="请输入11位手机号"
                maxLength={11}
              />
            </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleAddUser} disabled={isSubmitting}>
              {isSubmitting ? "创建中..." : "创建用户"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>编辑用户信息</DialogTitle>
            <DialogDescription>
              修改用户 {selectedUser?.realName} 的信息
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">用户名 *</Label>
              <Input
                id="edit-username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password">新密码</Label>
              <div className="relative">
                <Input
                  id="edit-password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="留空则不修改密码"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">如需修改密码，请输入新密码（至少6位）</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-realName">真实姓名 *</Label>
              <Input
                id="edit-realName"
                value={formData.realName}
                onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                placeholder="请输入真实姓名"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role">用户角色 *</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Reporter">现场人员</SelectItem>
                  <SelectItem value="Technician">维修人员</SelectItem>
                  <SelectItem value="Warehouse">仓库管理员</SelectItem>
                  <SelectItem value="Business">商务人员</SelectItem>
                  <SelectItem value="Admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phoneNumber">手机号</Label>
              <Input
                id="edit-phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                placeholder="请输入11位手机号"
                maxLength={11}
              />
            </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleEditUser} disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
