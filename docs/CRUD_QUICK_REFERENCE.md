# CRUD 功能快速参考

## 🚀 快速开始

本文档提供所有CRUD功能的快速参考，方便开发和使用。

---

## 📱 功能入口

| 功能 | 入口位置 | 权限要求 |
|------|----------|----------|
| **设备管理** | 批次详情页 → "添加设备"按钮 | 现场人员、管理员 |
| **批次信息编辑** | 批次详情页 → "编辑批次信息"按钮 | 现场人员、管理员 |
| **出厂日期编辑** | 仓库确认页 → "编辑出厂日期"按钮 | 仓库管理员 |
| **商务信息编辑** | 商务审核页 → "修改商务信息"按钮 | 商务人员、管理员 |
| **发货信息编辑** | 仓库发货页 → "修改发货信息"按钮 | 仓库管理员、管理员 |
| **用户管理** | `/admin/users` | 管理员 |

---

## 🔗 API速查表

### 批次设备管理

```typescript
// 添加设备
POST /api/tickets/batch-devices/[batchId]
Body: { devices: [{ deviceSn, modelName, ... }] }

// 编辑设备
PUT /api/tickets/batch-devices/[batchId]
Body: { deviceId, updates: { ... } }

// 删除设备
DELETE /api/tickets/batch-devices/[batchId]?deviceId=xxx
```

### 批次信息

```typescript
// 编辑批次信息
PUT /api/tickets/batch-info/[batchId]
Body: { projectName, contactInfo, projectLocation, senderAddress }
```

### 出厂日期

```typescript
// 编辑出厂日期
PUT /api/tickets/manufacture-date/[deviceId]
Body: { manufactureDate: "2024-06-15T00:00:00.000Z" }
```

### 商务信息

```typescript
// 获取商务信息
GET /api/tickets/business-info/[batchId]

// 编辑商务信息
PUT /api/tickets/business-info/[batchId]
Body: { isChargeable, isPaymentReceived, isInvoiced, totalCost, clientName }
```

### 发货信息

```typescript
// 获取发货信息
GET /api/tickets/shipping-info/[batchId]

// 编辑发货信息
PUT /api/tickets/shipping-info/[batchId]
Body: { shippingType, returnDate, returnTrackingNum, returnQuantity }
```

### 用户管理

```typescript
// 获取用户列表
GET /api/users

// 创建用户
POST /api/users
Body: { username, password, realName, role, phoneNumber }

// 编辑用户
PUT /api/users/[id]
Body: { realName, role, phoneNumber, password? }

// 删除用户
DELETE /api/users/[id]
```

---

## 🎯 组件使用

### BatchDeviceManager

```tsx
import BatchDeviceManager from "@/components/batch-device-manager"

<BatchDeviceManager
  batchId="WO20260225001"
  devices={devices}
  onDevicesChanged={() => fetchBatchDevices()}
  allowEdit={true}
/>
```

### BatchInfoEditor

```tsx
import BatchInfoEditor from "@/components/batch-info-editor"

<BatchInfoEditor
  batchInfo={batchInfo}
  onUpdated={() => fetchBatchData()}
  allowEdit={true}
/>
```

### UserManagement

```tsx
import UserManagement from "@/components/user-management"

<UserManagement />
```

---

## 🔐 权限代码示例

### 前端权限检查

```typescript
import { useAuth } from "@/context/auth-context"

const { user } = useAuth()

// 检查是否可以编辑设备
const canEditDevice = user?.role === "reporter" || user?.role === "admin"

// 检查是否可以编辑出厂日期
const canEditManufactureDate = user?.role === "warehouse" || user?.role === "admin"

// 检查是否可以编辑商务信息
const canEditBusiness = user?.role === "business" || user?.role === "admin"

// 检查是否可以管理用户
const canManageUsers = user?.role === "admin"
```

### 后端权限检查

```typescript
import { cookies } from "next/headers"

const cookieStore = await cookies()
const userRole = cookieStore.get("userRole")?.value

if (userRole !== "warehouse" && userRole !== "admin") {
  return NextResponse.json(
    { success: false, message: "权限不足" },
    { status: 403 }
  )
}
```

---

## 🎨 UI状态控制

### 编辑模式切换模式

```typescript
// 1. 添加状态
const [isEditMode, setIsEditMode] = useState(false)

// 2. 切换按钮
{status === "Completed" && (
  <Button
    variant="outline"
    onClick={() => setIsEditMode(!isEditMode)}
  >
    {isEditMode ? "取消编辑" : "编辑信息"}
  </Button>
)}

// 3. 条件渲染
{isEditMode ? (
  <Input value={value} onChange={...} />
) : (
  <span>{value}</span>
)}

// 4. 保存按钮
{isEditMode && (
  <Button onClick={handleSave}>保存修改</Button>
)}
```

---

## 📝 常见任务代码片段

### 1. 刷新数据

```typescript
const fetchData = async () => {
  try {
    setLoading(true)
    const response = await fetch(`/api/...`)
    const result = await response.json()
    
    if (result.success) {
      setData(result.data)
    } else {
      toast.error(result.message)
    }
  } catch (error) {
    toast.error("加载失败")
  } finally {
    setLoading(false)
  }
}
```

### 2. 提交表单

```typescript
const handleSubmit = async () => {
  // 验证
  if (!formData.required) {
    toast.error("必填项不能为空")
    return
  }

  setIsSubmitting(true)
  try {
    const response = await fetch('/api/...', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })

    const result = await response.json()
    if (result.success) {
      toast.success("操作成功")
      onSuccess()
    } else {
      toast.error(result.message)
    }
  } catch (error) {
    toast.error("操作失败")
  } finally {
    setIsSubmitting(false)
  }
}
```

### 3. 删除确认

```typescript
const handleDelete = async (id: string) => {
  if (!confirm("确定要删除吗？")) {
    return
  }

  try {
    const response = await fetch(`/api/.../${id}`, {
      method: 'DELETE'
    })

    const result = await response.json()
    if (result.success) {
      toast.success("删除成功")
      onDeleted()
    } else {
      toast.error(result.message)
    }
  } catch (error) {
    toast.error("删除失败")
  }
}
```

---

## 🔄 数据流程图

```
用户操作
   ↓
前端组件（验证）
   ↓
API端点（权限检查）
   ↓
数据库操作
   ↓
返回结果
   ↓
UI更新（Toast提示）
   ↓
刷新数据
```

---

## 📈 性能指标

| 操作 | 预期响应时间 | 说明 |
|------|--------------|------|
| 读取列表 | < 500ms | 单批次设备列表（< 50台） |
| 创建单个 | < 200ms | 单个设备/用户创建 |
| 批量创建 | < 1000ms | 10台设备批量创建 |
| 更新单个 | < 200ms | 单个字段更新 |
| 删除单个 | < 200ms | 软删除操作 |

---

## 🎉 总结

现在系统支持完整的CRUD操作：

- ✅ **6大功能模块**全部支持编辑
- ✅ **16个API端点**完整实现
- ✅ **严格的权限控制**
- ✅ **友好的UI/UX**
- ✅ **软删除策略**保护数据
- ✅ **实时数据同步**

立即开始使用这些功能，让工单管理更加灵活和高效！
