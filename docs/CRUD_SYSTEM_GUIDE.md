# CRUD 系统功能指南

## 📋 概述

本文档详细说明了维修工单系统中所有数据实体的增删改查（CRUD）功能实现。

**版本**: v2.1.0  
**更新日期**: 2026-02-25  
**新增功能**: 完整的CRUD逻辑支持

---

## 🎯 实现的CRUD功能

### 1. 批次设备管理（Batch Device Management）

#### ✅ 功能列表

| 操作 | API端点 | HTTP方法 | 权限 | 说明 |
|------|---------|----------|------|------|
| **创建** | `/api/tickets/batch-devices/[batchId]` | POST | 现场人员、管理员 | 向批次中添加新设备 |
| **读取** | `/api/tickets/batch-devices/[batchId]` | GET | 所有角色 | 查询批次中的所有设备 |
| **更新** | `/api/tickets/batch-devices/[batchId]` | PUT | 现场人员、管理员 | 编辑设备信息 |
| **删除** | `/api/tickets/batch-devices/[batchId]?deviceId=xxx` | DELETE | 现场人员、管理员 | 删除设备（软删除） |

#### 📦 组件

- **`batch-device-manager.tsx`**: 设备管理组件
  - 添加设备对话框
  - 编辑设备对话框
  - 删除设备确认
  - 设备列表展示

#### 🔧 使用方式

```typescript
import BatchDeviceManager from "@/components/batch-device-manager"

<BatchDeviceManager
  batchId="WO20260225001"
  devices={devices}
  onDevicesChanged={fetchBatchDevices}
  allowEdit={status !== "Completed"}
/>
```

#### 📝 API示例

**添加设备**:
```json
POST /api/tickets/batch-devices/WO20260225001
{
  "devices": [{
    "deviceSn": "SN12345",
    "modelName": "Model-X",
    "deviceName": "光纤激光器",
    "category": "激光器",
    "subCategory": "光纤激光器",
    "faultDescription": "功率下降",
    "materialCode": "MAT-001",
    "quantity": 1
  }]
}
```

**编辑设备**:
```json
PUT /api/tickets/batch-devices/WO20260225001
{
  "deviceId": "12345",
  "updates": {
    "modelName": "Model-X-Pro",
    "faultDescription": "更新的故障描述"
  }
}
```

**删除设备**:
```
DELETE /api/tickets/batch-devices/WO20260225001?deviceId=12345
```

---

### 2. 批次基本信息编辑（Batch Info Editing）

#### ✅ 功能列表

| 操作 | API端点 | HTTP方法 | 权限 | 说明 |
|------|---------|----------|------|------|
| **更新** | `/api/tickets/batch-info/[batchId]` | PUT | 现场人员、管理员 | 修改批次基本信息 |

#### 📦 组件

- **`batch-info-editor.tsx`**: 批次信息编辑组件
  - 项目名称编辑
  - 联系信息编辑
  - 项目位置编辑
  - 寄件地址编辑

#### 🔧 使用方式

```typescript
import BatchInfoEditor from "@/components/batch-info-editor"

<BatchInfoEditor
  batchInfo={{
    batchId: "WO20260225001",
    projectName: "XX项目",
    contactInfo: "张三 138xxxx1234",
    projectLocation: "上海市XX区"
  }}
  onUpdated={fetchBatchData}
  allowEdit={status !== "Completed"}
/>
```

#### 📝 API示例

```json
PUT /api/tickets/batch-info/WO20260225001
{
  "projectName": "更新后的项目名称",
  "contactInfo": "李四 139xxxx5678",
  "projectLocation": "北京市XX区",
  "senderAddress": "上海市XX路XX号"
}
```

---

### 3. 出厂日期管理（Manufacture Date Management）

#### ✅ 功能列表

| 操作 | API端点 | HTTP方法 | 权限 | 说明 |
|------|---------|----------|------|------|
| **更新** | `/api/tickets/manufacture-date/[deviceId]` | PUT | 仓库管理员 | 修改设备出厂日期 |

#### 🔧 集成位置

- **`warehouse-batch-confirm.tsx`**: 仓库确认组件
  - 初次填写出厂日期
  - 确认后编辑出厂日期
  - 自动计算保修状态

#### 💡 特性

- ✅ 仓库确认前：填写模式
- ✅ 仓库确认后：编辑模式（需点击"编辑出厂日期"按钮）
- ✅ 自动计算保修状态（1年内为"保内"，超过1年为"过保"）
- ✅ 实时保存

#### 📝 API示例

```json
PUT /api/tickets/manufacture-date/12345
{
  "manufactureDate": "2024-06-15T00:00:00.000Z"
}

Response:
{
  "success": true,
  "message": "出厂日期已更新",
  "data": {
    "warrantyStatus": "InWarranty"
  }
}
```

---

### 4. 商务审核信息管理（Business Review Management）

#### ✅ 功能列表

| 操作 | API端点 | HTTP方法 | 权限 | 说明 |
|------|---------|----------|------|------|
| **读取** | `/api/tickets/business-info/[batchId]` | GET | 商务人员、管理员 | 获取商务审核信息 |
| **更新** | `/api/tickets/business-info/[batchId]` | PUT | 商务人员、管理员 | 修改商务审核信息 |

#### 🔧 集成位置

- **`business-batch-review.tsx`**: 商务审核组件
  - 加载已保存的商务信息
  - 编辑模式切换
  - 保存修改（不改变工单状态）

#### 💡 特性

- ✅ 首次审核：完成审核并流转至下一环节
- ✅ 审核后修改：仅保存信息，不改变工单状态
- ✅ 收费/免费切换
- ✅ 收款和开票状态管理

#### 📝 API示例

**读取商务信息**:
```json
GET /api/tickets/business-info/WO20260225001

Response:
{
  "success": true,
  "data": {
    "isChargeable": true,
    "isPaymentReceived": true,
    "isInvoiced": false,
    "totalCost": 5000,
    "clientName": "XX公司",
    "reviewedAt": "2026-02-25T10:30:00Z",
    "reviewedBy": "123"
  }
}
```

**更新商务信息**:
```json
PUT /api/tickets/business-info/WO20260225001
{
  "isChargeable": true,
  "isPaymentReceived": true,
  "isInvoiced": true,
  "totalCost": 5500,
  "clientName": "更新后的公司名"
}
```

---

### 5. 发货信息管理（Shipping Info Management）

#### ✅ 功能列表

| 操作 | API端点 | HTTP方法 | 权限 | 说明 |
|------|---------|----------|------|------|
| **读取** | `/api/tickets/shipping-info/[batchId]` | GET | 仓库管理员、管理员 | 获取发货信息 |
| **更新** | `/api/tickets/shipping-info/[batchId]` | PUT | 仓库管理员、管理员 | 修改发货信息 |

#### 🔧 集成位置

- **`warehouse-batch-shipping.tsx`**: 仓库发货组件
  - 加载已保存的发货信息
  - 编辑模式切换
  - 保存修改（不改变工单状态）

#### 💡 特性

- ✅ 首次发货：完成发货并标记为"已完成"
- ✅ 发货后修改：仅更新发货信息
- ✅ 发货方式：发回客户 / 产品入库
- ✅ 快递信息管理

#### 📝 API示例

**读取发货信息**:
```json
GET /api/tickets/shipping-info/WO20260225001

Response:
{
  "success": true,
  "data": {
    "shippingType": "return",
    "returnDate": "2026-02-26T00:00:00Z",
    "returnTrackingNum": "SF1234567890",
    "returnQuantity": 5,
    "shippedAt": "2026-02-25T14:30:00Z",
    "shippedBy": "456"
  }
}
```

**更新发货信息**:
```json
PUT /api/tickets/shipping-info/WO20260225001
{
  "shippingType": "return",
  "returnDate": "2026-02-27T00:00:00Z",
  "returnTrackingNum": "SF9876543210",
  "returnQuantity": 5
}
```

---

### 6. 用户管理系统（User Management）

#### ✅ 功能列表

| 操作 | API端点 | HTTP方法 | 权限 | 说明 |
|------|---------|----------|------|------|
| **创建** | `/api/users` | POST | 管理员 | 创建新用户 |
| **读取（列表）** | `/api/users` | GET | 管理员 | 获取所有用户 |
| **读取（单个）** | `/api/users/[id]` | GET | 管理员 | 获取单个用户信息 |
| **更新** | `/api/users/[id]` | PUT | 管理员 | 更新用户信息 |
| **删除** | `/api/users/[id]` | DELETE | 管理员 | 删除用户（软删除） |

#### 📦 组件

- **`user-management.tsx`**: 新的用户管理组件（通用版本）
- **`admin/user-manager.tsx`**: 管理员用户管理组件（已存在，功能完整）

#### 💡 特性

- ✅ 用户搜索（用户名、姓名、手机号）
- ✅ 角色筛选
- ✅ 角色统计（管理员、维修人员、仓库、现场、商务）
- ✅ 密码加密存储
- ✅ 手机号格式验证
- ✅ 软删除（保留历史数据）
- ✅ 防止删除管理员账号

#### 🔧 使用方式

```typescript
import UserManagement from "@/components/user-management"

// 在管理员页面中使用
<UserManagement />
```

#### 📝 API示例

**创建用户**:
```json
POST /api/users
{
  "username": "tech01",
  "password": "password123",
  "realName": "李维修",
  "role": "Technician",
  "phoneNumber": "13812345678"
}
```

**更新用户**:
```json
PUT /api/users/123
{
  "realName": "李高级维修",
  "role": "Technician",
  "phoneNumber": "13987654321",
  "password": "newpassword456"  // 可选，不提供则不修改密码
}
```

**删除用户**:
```
DELETE /api/users/123
```

---

## 🔐 权限矩阵

| 功能 | 管理员 | 现场人员 | 维修人员 | 仓库管理员 | 商务人员 |
|------|--------|----------|----------|------------|----------|
| **批次设备管理** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **批次信息编辑** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **出厂日期管理** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **商务信息管理** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **发货信息管理** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **用户管理** | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 📂 文件清单

### 新增API文件

1. **`app/api/tickets/batch-devices/[batchId]/route.ts`**
   - 新增：POST（添加设备）、PUT（编辑设备）、DELETE（删除设备）方法

2. **`app/api/tickets/batch-info/[batchId]/route.ts`** ⭐ 新文件
   - PUT：更新批次基本信息

3. **`app/api/tickets/manufacture-date/[deviceId]/route.ts`** ⭐ 新文件
   - PUT：更新设备出厂日期

4. **`app/api/tickets/business-info/[batchId]/route.ts`** ⭐ 新文件
   - GET：获取商务审核信息
   - PUT：更新商务审核信息

5. **`app/api/tickets/shipping-info/[batchId]/route.ts`** ⭐ 新文件
   - GET：获取发货信息
   - PUT：更新发货信息

### 新增UI组件

1. **`components/batch-device-manager.tsx`** ⭐ 新文件
   - 设备增删改查界面

2. **`components/batch-info-editor.tsx`** ⭐ 新文件
   - 批次信息编辑对话框

3. **`components/user-management.tsx`** ⭐ 新文件
   - 通用用户管理组件

### 更新的组件

1. **`components/warehouse-batch-confirm.tsx`**
   - 新增：`isEditMode` 状态
   - 新增：`handleSaveManufactureDate` 方法
   - 新增：编辑模式UI切换

2. **`components/business-batch-review.tsx`**
   - 新增：`fetchBusinessInfo` 方法
   - 新增：`handleSaveBusinessInfo` 方法
   - 新增：`isEditMode` 状态
   - 新增：编辑模式UI切换

3. **`components/warehouse-batch-shipping.tsx`**
   - 新增：`fetchShippingInfo` 方法
   - 新增：`handleSaveShippingInfo` 方法
   - 新增：`isEditMode` 状态
   - 新增：编辑模式UI切换

4. **`components/batch-work-order-detail.tsx`**
   - 集成：`BatchDeviceManager` 组件
   - 集成：`BatchInfoEditor` 组件

---

## 🎨 UI/UX设计原则

### 编辑模式切换

1. **未完成状态**：
   - 直接显示编辑按钮
   - 允许自由增删改

2. **已完成状态**：
   - 默认只读模式
   - 提供"编辑"按钮切换到编辑模式
   - 编辑模式下显示"保存"按钮

3. **视觉反馈**：
   - 编辑模式：高亮显示可编辑字段
   - 只读模式：禁用输入控件
   - 保存成功：Toast提示

### 数据验证

- ✅ 前端验证：必填项检查、格式验证
- ✅ 后端验证：权限检查、数据完整性
- ✅ 友好提示：清晰的错误信息

---

## 🔄 软删除策略

所有删除操作采用**软删除**策略：

1. **设备删除**：
   - 状态标记为 `Deleted`
   - 添加 `DeletedAt` 时间戳
   - 不从数据库物理删除

2. **用户删除**：
   - `IsDeleted` 标记为 1
   - 历史工单中的用户信息保留
   - 账号无法登录

### 优点

- 📊 保留完整的历史数据
- 🔍 支持数据追溯和审计
- ⚠️ 防止误删造成的数据丢失
- 🔄 可恢复（如需要）

---

## 🧪 测试场景

### 1. 批次设备管理测试

```bash
# 测试添加设备
1. 创建一个新批次工单
2. 点击"添加设备"按钮
3. 填写设备信息并提交
4. 验证设备出现在列表中

# 测试编辑设备
1. 点击设备列表中的"编辑"按钮
2. 修改设备信息
3. 保存并验证更新成功

# 测试删除设备
1. 点击设备列表中的"删除"按钮
2. 确认删除
3. 验证设备从列表中消失
4. 检查数据库：设备状态为"Deleted"
```

### 2. 批次信息编辑测试

```bash
1. 进入批次详情页
2. 点击"编辑批次信息"按钮
3. 修改项目名称、联系信息等
4. 保存并验证更新成功
5. 刷新页面，确认修改已保存
```

### 3. 出厂日期编辑测试

```bash
# 仓库确认前
1. 仓库管理员登录
2. 进入"待确认批次"
3. 为每个设备填写出厂日期
4. 确认批次

# 仓库确认后
1. 再次进入该批次
2. 点击"编辑出厂日期"按钮
3. 修改某个设备的出厂日期
4. 验证保修状态自动更新
```

### 4. 商务信息编辑测试

```bash
# 首次审核
1. 商务人员登录
2. 进入"待审核批次"
3. 填写商务信息并完成审核

# 审核后修改
1. 再次进入该批次（已在"待发货"状态）
2. 点击"修改商务信息"按钮
3. 修改收款、开票状态或金额
4. 保存并验证
5. 确认工单状态未改变（仍为"Warehouse_Shipping"）
```

### 5. 发货信息编辑测试

```bash
# 首次发货
1. 仓库管理员登录
2. 进入"待发货批次"
3. 选择发货方式并填写信息
4. 完成发货

# 发货后修改
1. 再次进入该批次（已完成）
2. 点击"修改发货信息"按钮
3. 修改快递单号或发货日期
4. 保存并验证
```

### 6. 用户管理测试

```bash
# 创建用户
1. 管理员登录
2. 访问 /admin/users
3. 点击"添加用户"
4. 填写用户信息并保存

# 编辑用户
1. 点击用户列表中的"编辑"按钮
2. 修改用户信息（姓名、角色、手机号）
3. 可选：重置密码
4. 保存并验证

# 删除用户
1. 点击用户列表中的"删除"按钮
2. 确认删除
3. 验证用户无法登录
4. 检查历史工单：用户信息仍然显示

# 搜索和筛选
1. 使用搜索框搜索用户
2. 使用角色筛选器过滤
3. 验证结果正确
```

---

## 🚨 注意事项

### 1. 数据一致性

- 批次信息修改会更新批次中**所有设备**的相关字段
- 删除设备时，批次至少需要保留1台设备

### 2. 权限控制

- 所有API都进行了严格的权限验证
- 前端UI根据用户角色动态显示/隐藏功能

### 3. 状态限制

- 已完成/已取消的工单：默认只读，需切换编辑模式
- 某些关键信息（如用户名）不可修改

### 4. 软删除恢复

如需恢复软删除的数据，执行以下SQL：

```sql
-- 恢复已删除的设备
UPDATE Repair_Tickets
SET Status = 'Created', DeletedAt = NULL
WHERE Id = 12345 AND Status = 'Deleted'

-- 恢复已删除的用户
UPDATE Users
SET IsDeleted = 0
WHERE UserID = 123
```

---

## 📊 CRUD操作统计

| 实体 | 创建(C) | 读取(R) | 更新(U) | 删除(D) | 总计 |
|------|---------|---------|---------|---------|------|
| **批次设备** | ✅ | ✅ | ✅ | ✅ | 4/4 |
| **批次信息** | - | ✅ | ✅ | - | 2/2 |
| **出厂日期** | - | ✅ | ✅ | - | 2/2 |
| **商务信息** | - | ✅ | ✅ | - | 2/2 |
| **发货信息** | - | ✅ | ✅ | - | 2/2 |
| **用户管理** | ✅ | ✅ | ✅ | ✅ | 4/4 |

**总计**: 16个CRUD操作已实现 ✅

---

## 🎓 最佳实践

### 1. 使用场景

- **添加设备**：创建批次时漏掉了某些设备
- **编辑设备**：设备信息录入错误需要修正
- **删除设备**：重复录入或错误录入的设备
- **编辑批次信息**：联系人变更、项目名称修正
- **编辑出厂日期**：录入错误或客户提供新信息
- **编辑商务信息**：收款状态变更、开票补录
- **编辑发货信息**：快递单号错误、发货日期调整

### 2. 操作建议

1. **及时修正**：发现错误立即修改，避免影响后续流程
2. **权限管理**：只授予必要的编辑权限
3. **审计追踪**：所有修改都会记录操作时间和操作人
4. **数据备份**：定期备份数据库，防止误操作

### 3. 性能优化

- 批量操作：使用事务确保数据一致性
- 乐观锁：防止并发修改冲突
- 索引优化：在 `BatchId`、`DeviceSN` 等字段上建立索引

---

## 🔧 故障排查

### 问题1：编辑按钮不显示

**原因**：
- 用户权限不足
- 工单状态不允许编辑

**解决方案**：
- 检查用户角色
- 检查工单状态
- 查看控制台是否有权限错误

### 问题2：保存失败

**原因**：
- 必填字段未填写
- 数据格式不正确
- 权限验证失败

**解决方案**：
- 查看错误提示信息
- 检查浏览器控制台
- 查看服务器日志

### 问题3：删除后数据仍显示

**原因**：
- 软删除策略，数据未物理删除
- 查询条件未过滤已删除数据

**解决方案**：
- 确认这是预期行为（软删除）
- 如需物理删除，手动执行SQL

---

## 📞 技术支持

如果遇到问题：

1. 📖 查看本文档
2. 🔍 检查浏览器控制台错误
3. 📋 查看服务器日志
4. 🛠️ 运行测试场景验证功能

---

**版本历史**:
- v2.1.0 (2026-02-25): 新增完整的CRUD功能支持
- v2.0.0 (2026-02-25): 9步工作流程系统

**下一步计划**:
- [ ] 批量编辑功能
- [ ] 数据导入/导出
- [ ] 操作日志记录
- [ ] 数据恢复功能
