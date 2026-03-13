# 批次工单系统实现文档

## 概述

本文档描述了维修系统的批次工单功能实现，使得同一次提交的多个设备能够关联到同一个批次下，方便统一管理、回寄追踪和批量查看。

## 系统架构

### 数据库设计

#### Batch 表（批次表）
```prisma
model Batch {
  id          String   @id @default(cuid())
  batchNumber String   @unique
  projectId   String?
  customerId  String?
  status      String   @default("created")
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?
  
  tickets     Repair_Tickets[]
  project     Project?
  customer    Customer?
}
```

#### Repair_Tickets 表（工单表）
- 新增字段：`batchId` - 关联到 Batch 表
- 通过 `batchId` 外键关联，实现一对多关系（一个批次包含多个工单）

## 核心功能实现

### 1. 批量创建工单（repair-form.tsx）

**改进前**：
- 使用 `/api/tickets/create` 单个创建接口
- 循环调用多次，每个设备独立创建
- 虽有 `workOrderNumber` 但无批次关联
- 无法按批次统一管理

**改进后**：
- 使用 `/api/tickets/batch` 批量创建接口
- 一次请求创建整批工单
- 自动生成批次号（格式：`BATCH-{timestamp}-{random}`）
- 所有工单自动关联到同一批次

**请求数据格式**：
```typescript
{
  customerInfo: {
    name: "项目名称",
    contact: "联系人",
    phone: "电话",
    address: "寄件地址",
    project: "项目地点"
  },
  items: [
    {
      productModel: "设备型号",
      deviceSn: "序列号",
      faultDesc: "故障描述",
      category: "产品分类",
      subCategory: "产品子分类",
      courierInfo: "快递单号",
      courierCompany: "快递公司",
      materialCode: "物料代码"
    }
  ]
}
```

**返回数据**：
```json
{
  "success": true,
  "message": "成功创建 3 个工单",
  "data": {
    "batchId": "BATCH-1738483200000-a1b2c3d4e5f6g7h8",
    "ticketIds": ["15", "16", "17"],
    "count": 3
  }
}
```

### 2. 批次创建 API（/api/tickets/batch）

**功能增强**：
- 支持更多字段：`ProjectLocation`、`MaterialCode`、`TrackingNumber_In`、`CourierCompany`
- 自动生成批次号
- 批量插入工单，所有工单共享同一 `batchId`
- 返回批次ID和工单ID列表

**关键代码**：
```typescript
// 生成批次号
const timestamp = Date.now();
const randomStr = crypto.randomBytes(8).toString("hex");
const batchId = `BATCH-${timestamp}-${randomStr}`;

// 为每个设备创建工单，统一使用同一批次号
for (const item of items) {
  insertRequest.input("batchId", batchId);
  // ... 其他字段
  await insertRequest.query(insertQuery);
}
```

### 3. 工单列表增强（/app/repairs/page.tsx）

**新增功能**：
1. **显示批次标识**：有批次的工单显示"批次"徽章
2. **显示批次号**：可点击的批次号，跳转到批次详情页
3. **批次号搜索**：支持按批次号搜索工单
4. **视觉区分**：批次号使用蓝色高亮显示

**UI 改进**：
```tsx
{(repair as any).batchId && (
  <>
    <Badge variant="outline" className="bg-blue-50 text-blue-700">
      批次
    </Badge>
    <p 
      className="text-xs text-blue-600 hover:underline cursor-pointer"
      onClick={() => router.push(`/batch/${repair.batchId}`)}
    >
      批次号：{repair.batchId}
    </p>
  </>
)}
```

### 4. 批次详情页面（/app/batch/[id]/page.tsx）

**核心功能**：
- 显示批次基本信息（批次号、状态、创建时间等）
- 显示批次统计（总工单数、已完成数、进行中数）
- 列出批次下所有工单
- 每个工单可点击查看详情

**页面结构**：
```
批次详情页
├── 批次信息卡片
│   ├── 批次号
│   ├── 状态
│   ├── 工单数量
│   ├── 已完成/进行中统计
│   ├── 创建时间
│   ├── 创建人
│   └── 项目/客户信息
└── 工单列表
    └── 每个工单卡片
        ├── 状态徽章
        ├── 序列号
        ├── 型号/设备名称
        ├── 故障描述
        ├── 项目地点
        ├── 报告人
        ├── 快递单号
        └── 查看详情按钮
```

### 5. 批次详情 API（/api/batch/[id]）

**功能**：
- 通过批次ID查询批次信息
- 使用 Prisma 关联查询，一次性获取批次、工单、项目、客户信息
- 返回格式化的批次数据

**查询逻辑**：
```typescript
const batch = await prisma.batch.findUnique({
  where: { id: id },
  include: {
    tickets: {
      orderBy: { createdAt: "desc" }
    },
    project: true,
    customer: true
  }
});
```

### 6. 工单列表 API 增强（/api/tickets）

**改进**：
- 返回数据中包含 `batchId` 字段
- 前端可根据 `batchId` 判断是否为批次工单
- 支持批次号搜索和筛选

## 使用场景

### 场景 1：现场人员批量报修
1. 现场人员打开"新建工单"表单
2. 添加多个设备（每个设备可有独立的故障描述）
3. 填写统一的寄件地址、快递单号等信息
4. 提交后，系统自动创建批次并关联所有工单
5. 显示批次号，方便后续追踪

### 场景 2：查看批次下的所有设备
1. 在工单列表中，点击批次号
2. 跳转到批次详情页
3. 查看该批次的所有工单状态
4. 统一管理和追踪整批设备的维修进度

### 场景 3：批次回寄管理
1. 维修完成后，仓库人员查看批次详情
2. 确认批次下所有设备都已完成维修
3. 统一安排回寄，使用同一快递单号
4. 更新批次状态为"已发货"

### 场景 4：按批次搜索工单
1. 在工单列表搜索框输入批次号
2. 快速筛选出该批次的所有工单
3. 批量查看或导出

## 数据流程

```
用户提交多设备报修
    ↓
repair-form.tsx 组装批量请求
    ↓
POST /api/tickets/batch
    ↓
生成批次号 (BATCH-timestamp-random)
    ↓
批量创建工单，统一 batchId
    ↓
返回批次ID和工单ID列表
    ↓
前端显示成功消息（含批次号）
    ↓
工单列表显示批次标识
    ↓
点击批次号 → 批次详情页
    ↓
显示批次下所有工单
```

## 优势

### 1. 统一管理
- 同一批次的设备集中管理
- 方便查看整批设备的维修进度
- 统一回寄，减少物流成本

### 2. 追踪便利
- 批次号作为唯一标识
- 快速定位同批设备
- 支持批次级别的状态查询

### 3. 数据完整性
- 通过外键关联保证数据一致性
- 批次和工单的关系清晰
- 支持批次级别的统计分析

### 4. 用户体验
- 一次提交，批量创建
- 批次号可点击跳转
- 批次详情页信息丰富
- 支持批次号搜索

## 技术要点

### 1. 批次号生成
```typescript
const timestamp = Date.now();
const randomStr = crypto.randomBytes(8).toString("hex");
const batchId = `BATCH-${timestamp}-${randomStr}`;
```
- 时间戳确保唯一性
- 随机字符串增加安全性
- 格式易于识别和搜索

### 2. Prisma 关联查询
```typescript
include: {
  tickets: { orderBy: { createdAt: "desc" } },
  project: true,
  customer: true
}
```
- 一次查询获取所有关联数据
- 减少数据库往返次数
- 提高查询性能

### 3. 前端状态管理
- 批次创建后立即更新本地状态
- 工单列表实时显示批次信息
- 批次详情页独立加载数据

## 未来扩展

### 1. 批次状态管理
- 批次级别的状态流转
- 批量更新批次下所有工单状态
- 批次完成自动通知

### 2. 批次打印
- 批次维修报告打印
- 批次标签打印
- 批次装箱单

### 3. 批次统计
- 批次维修时长统计
- 批次费用汇总
- 批次完成率分析

### 4. 批次回寄
- 批次回寄单号录入
- 批次回寄状态追踪
- 批次签收确认

## 总结

批次工单系统通过将同一次提交的多个设备关联到统一的批次下，实现了：
- ✅ 统一管理：批次级别的工单管理
- ✅ 便捷追踪：批次号快速定位
- ✅ 数据完整：外键关联保证一致性
- ✅ 用户友好：批量创建，批次详情页
- ✅ 可扩展：支持未来批次级别的功能扩展

这为维修系统的工单管理提供了更高效、更规范的解决方案。
