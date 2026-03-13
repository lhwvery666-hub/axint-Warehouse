# 批次工单页面修复

## 问题描述

现场人员（reporter）点击批次工单时，页面报错"获取批次详情时发生错误"，无法访问聊天窗口和签字凭证。

### 错误信息
```
第一次错误: 获取批次详情时发生错误
第二次错误: Invalid column name 'undefined'.
```

## 根本原因

发现了两个问题：

### 问题1: 调用错误的API
- `/batch/[id]/page.tsx` 调用的API是 `/api/batch/${batchId}`
- 这个API查询的是**独立的批次表**，但系统中的批次信息实际存储在 `Repair_Tickets` 表的 `BatchId` 字段中
- 导致API返回错误，页面加载失败

### 问题2: 缺少数据库字段常量定义
- `/api/tickets/batch-devices/[batchId]` 中使用了 `DB_FIELDS.CREATED_AT`
- 但 `lib/enums.ts` 中没有定义 `CREATED_AT` 字段
- 导致SQL查询中出现 `undefined`，报错 "Invalid column name 'undefined'."

## 解决方案

### ✅ 修改内容

#### 修复1: 使用正确的组件和API

**文件**: `app/batch/[id]/page.tsx`

#### 修改前 ❌
```typescript
// 查询独立的批次表（数据不匹配）
const response = await fetch(`/api/batch/${batchId}`);

// 包含大量独立的UI渲染逻辑
<Card>...</Card>
<Table>...</Table>
```

#### 修改后 ✅
```typescript
import BatchWorkOrderDetail from "@/components/batch-work-order-detail";

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.id as string;

  return (
    <BatchWorkOrderDetail 
      batchId={batchId} 
      onBack={() => router.back()} 
    />
  );
}
```

### 🎯 现在的功能

现在所有角色点击批次工单后，都会正确进入批次工单详情页面，可以：

1. 💬 **工单沟通记录**
   - 查看所有聊天历史
   - 发送新消息
   - 多角色实时沟通

2. 📸 **签字凭证**
   - 查看客户签字的报告照片
   - 查看大图、下载、复制链接
   - 状态提示（已上传/待上传）

3. 📋 **工单基础信息**
   - 工单号、项目名称、位置
   - 联系信息、产品类别
   - 设备数量统计

4. 🔧 **设备列表**
   - 显示所有设备的详细信息
   - 点击"查看详情"查看单个设备

5. 📝 **维修报告操作**
   - 维修人员：编辑维修报告
   - 所有角色：查看/打印维修报告

## API使用

现在统一使用正确的API：
- **设备列表**: `/api/tickets/batch-devices/${batchId}`
- **批次报告**: `/api/tickets/batch-repair-report/${batchId}`

这些API正确查询 `Repair_Tickets` 表中的批次数据。

**注意**: 同时修复了 `lib/enums.ts` 中缺失的 `CREATED_AT` 和 `UPDATED_AT` 字段定义，避免 SQL 查询出现 `undefined` 列名错误。

## 访问路径

### 所有角色
```
Dashboard/工单列表
    ↓ 点击批次工单卡片
/batch/[batchId]
    ↓
✅ BatchWorkOrderDetail 组件
    ↓
✅ 工单信息、设备列表、聊天、签字凭证
```

### 现场人员 (Reporter)
- ✅ 查看工单信息
- ✅ 查看聊天记录
- ✅ 发送消息
- ✅ 查看签字凭证
- ✅ 查看维修报告

### 维修人员 (Technician)
- ✅ 所有现场人员权限
- ✅ 编辑维修报告
- ✅ 打印维修报告

### 管理员 (Admin)
- ✅ 查看所有信息
- ✅ 参与沟通
- ✅ 监控进度

## 测试验证

### 基本功能
- ✅ 现场人员可以访问批次工单详情页
- ✅ 页面正确加载工单信息
- ✅ 设备列表正确显示
- ✅ 聊天功能正常工作
- ✅ 签字凭证正常显示
- ✅ 维修报告按钮正常跳转

### 权限测试
- ✅ 现场人员：看不到"编辑维修报告"按钮
- ✅ 维修人员：可以看到"编辑维修报告"按钮
- ✅ 所有角色：可以"查看/打印维修报告"

### 数据完整性
- ✅ BatchId 参数正确传递
- ✅ API调用成功
- ✅ 设备数据正确显示
- ✅ 聊天消息正确加载
- ✅ 签字照片正确显示

---

**修复时间**: 2026-02-25  
**版本**: v1.1.1  
**状态**: ✅ 已修复
