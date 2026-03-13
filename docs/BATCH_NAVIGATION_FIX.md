# 批次工单导航修复 - 确保签字凭证可见

## 问题描述

用户从首页点击单个设备进入详情页后，看不到签字凭证和聊天记录。

### 问题原因

- 签字凭证和聊天记录是**批次级别**的功能，只在批次详情页（`/batch/[id]`）显示
- 但是，即使设备属于某个批次（有 `batchId`），从首页或维修工单管理页点击时，仍然进入单设备详情页
- 单设备详情页（`RepairDetail` 组件）没有签字凭证和聊天功能

### 导航逻辑对比

#### 修复前 ❌

```
首页/工单列表
    ↓ 点击设备卡片
检查: task.isBatch？
    ├─ 是 → 批次详情页 ✅ 可以看到签字凭证
    └─ 否 → 单设备详情页 ❌ 看不到签字凭证
            （即使设备有 batchId！）
```

#### 修复后 ✅

```
首页/工单列表
    ↓ 点击设备卡片
检查: task.batchId？
    ├─ 有 → 批次详情页 ✅ 可以看到签字凭证
    └─ 无 → 单设备详情页
            （真正的单独设备）
```

## 解决方案

### ✅ 修改的文件

#### 1. `components/dashboard.tsx`

**修改内容：**

```typescript
// 修改前
onClick={() => {
  if (task.isBatch && task.batchId) {
    router.push(`/batch/${task.batchId}`);
  } else {
    onStartRepair(task.id);
  }
}}

// 修改后
onClick={() => {
  // 如果有批次ID（不管是批次工单还是批次中的单个设备），都跳转到批次详情页
  // 这样可以查看批次级别的聊天和签字凭证
  if (task.batchId) {
    router.push(`/batch/${task.batchId}`);
  } else {
    onStartRepair(task.id);
  }
}}
```

**关键变化：**
- 从检查 `task.isBatch && task.batchId` 改为只检查 `task.batchId`
- 只要设备有批次ID，就跳转到批次详情页

#### 2. `components/repair-page.tsx`

**修改内容：**

1. **添加 router 导入**
```typescript
import { useRouter } from "next/navigation"

export default function RepairPage(...) {
  const router = useRouter()
  // ...
}
```

2. **修改点击逻辑**
```typescript
// 修改前
onClick={() => {
  if (task.isBatch && task.devices && task.devices.length > 0) {
    setCurrentBatchTask(task);
    setSelectedTaskId(null);
    setView("batchSelect");
  } else {
    handleViewTask(task.id);
  }
}}

// 修改后
onClick={() => {
  if (task.isBatch && task.devices && task.devices.length > 0) {
    setCurrentBatchTask(task);
    setSelectedTaskId(null);
    setView("batchSelect");
  } else if (task.batchId) {
    // 如果是批次中的单个设备，跳转到批次详情页
    // 这样可以查看批次级别的聊天和签字凭证
    router.push(`/batch/${task.batchId}`);
  } else {
    handleViewTask(task.id);
  }
}}
```

**关键变化：**
- 添加 `else if (task.batchId)` 分支
- 有批次ID的单个设备跳转到批次详情页，而不是单设备详情页

## 受益功能

修复后，用户从任何入口点击属于批次的设备，都能看到：

1. 💬 **工单沟通记录**
   - 与维修人员、现场人员的实时聊天
   - 历史消息记录
   - 消息未读红点提示

2. 📸 **签字凭证**
   - 查看客户签字的报告照片
   - 下载、查看大图、复制链接
   - 上传状态提示（已上传/待上传/已锁定）

3. 📋 **批次工单信息**
   - 工单号、项目名称、联系人
   - 设备数量统计
   - 产品类别

4. 🔧 **设备列表**
   - 批次下所有设备
   - 点击"查看详情"查看单个设备详细信息

5. 📝 **维修报告操作**
   - 编辑维修报告（维修人员）
   - 查看/打印维修报告（所有角色）
   - 在对话框中操作，无需跳转

## 用户场景

### 场景1: 从首页进入

```
用户登录
    ↓
首页（Dashboard）显示待处理工单
    ↓
点击工单卡片（设备有 batchId）
    ↓
✅ 自动跳转到批次详情页
    ↓
✅ 看到签字凭证、聊天记录、所有设备列表
```

### 场景2: 从维修工单管理进入

```
点击侧边栏"维修工单"
    ↓
工单列表显示
    ↓
点击工单卡片（设备有 batchId）
    ↓
✅ 自动跳转到批次详情页
    ↓
✅ 看到签字凭证、聊天记录、所有设备列表
```

### 场景3: 真正的单独设备

```
点击工单卡片（设备没有 batchId）
    ↓
进入单设备详情页
    ↓
查看该设备的详细信息、维修记录等
```

## 数据流程

### 批次设备的识别

1. **数据库字段**: `Repair_Tickets.BatchId`
2. **前端字段**: `task.batchId`
3. **判断逻辑**: `if (task.batchId)`

### 批次详情页数据

- **URL**: `/batch/[batchId]`
- **API**: `/api/tickets/batch-devices/${batchId}`
- **返回数据**:
  - `batchInfo`: 批次基础信息（包括 `signedReportPhoto`）
  - `devices`: 批次下所有设备列表

### 签字凭证数据

- **字段**: `batchInfo.signedReportPhoto`
- **存储**: 公共上传目录 `/uploads/signed-reports/`
- **显示位置**: 批次详情页的"签字凭证"卡片

## 测试验证

### 基本功能测试

- ✅ 从首页点击批次设备，跳转到批次详情页
- ✅ 从维修工单管理点击批次设备，跳转到批次详情页
- ✅ 批次详情页正确显示签字凭证
- ✅ 批次详情页正确显示聊天记录
- ✅ 批次详情页正确显示设备列表

### 边界情况测试

- ✅ 点击真正的单独设备（无 batchId），进入单设备详情页
- ✅ 批次工单（`isBatch=true`），仍然正确跳转到批次详情页
- ✅ 批次中的单个设备（`isBatch=false` 但有 `batchId`），跳转到批次详情页

### 数据完整性测试

- ✅ 签字凭证图片正确加载
- ✅ 聊天消息正确显示
- ✅ 设备列表完整显示
- ✅ 未读消息红点正确显示

## 注意事项

1. **批次ID的存在性**: 修复依赖于 `batchId` 字段的正确性，确保数据库中相关设备都有正确的 `BatchId` 值

2. **单设备与批次设备的区分**:
   - 有 `batchId` → 批次设备，跳转到批次详情页
   - 无 `batchId` → 单独设备，进入单设备详情页

3. **向后兼容**: 
   - 批次工单（`isBatch=true`）的行为不变
   - 单独设备（无 `batchId`）的行为不变
   - 只影响有 `batchId` 的单个设备

4. **性能考虑**:
   - 批次详情页会加载批次下所有设备
   - 如果批次很大，考虑添加分页或虚拟滚动

## 扩展性

如果将来需要在单设备详情页也显示批次级别的信息，可以：

1. **选项A**: 在单设备详情页添加"查看批次详情"按钮
```typescript
{device.batchId && (
  <Button onClick={() => router.push(`/batch/${device.batchId}`)}>
    查看批次详情（含聊天和签字凭证）
  </Button>
)}
```

2. **选项B**: 在单设备详情页嵌入批次信息
```typescript
{device.batchId && (
  <Card>
    <CardHeader>
      <CardTitle>批次信息</CardTitle>
    </CardHeader>
    <CardContent>
      {/* 显示签字凭证、聊天等 */}
    </CardContent>
  </Card>
)}
```

但目前推荐的方式是：**统一跳转到批次详情页**，保持信息集中，避免重复实现。

---

**修复时间**: 2026-02-25  
**版本**: v1.2.1  
**状态**: ✅ 已完成
