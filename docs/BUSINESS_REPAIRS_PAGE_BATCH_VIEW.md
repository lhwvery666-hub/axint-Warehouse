# 商务管理工单页面批次视图重构

**执行时间**: 2026-02-26  
**问题类型**: UI/UX 错误  
**影响范围**: 商务管理 - 工单管理页面

---

## 🐛 问题描述

### 用户反馈
"这个页面是单独的设备不对啊应该是以工单为单位"

### 界面问题

在商务管理的"工单管理"页面（`/business/repairs`），显示的是**单个设备的工单**：
- 工单号：N74C1I20（设备序列号）
- 工单号：N76J2501（设备序列号）
- 工单号：K2025040134（设备序列号）

但商务人员应该看到的是**批次工单**：
- 工单号：WO2602263315（批次号）
- 包含：3 台设备

### 根本原因

`app/business/repairs/page.tsx` 直接复用了通用的 `RepairsPage` 组件：

```tsx
// ❌ 有问题的代码
"use client";

import RepairsPage from "@/app/repairs/page";

export default function BusinessRepairsPage() {
  // 直接复用通用的维修工单管理页面，让它显示在商务布局右侧
  return <RepairsPage />;
}
```

**问题分析**:
- `RepairsPage` 是一个通用的工单列表页面，显示的是**所有单个设备的工单**
- 对于维修人员、仓库人员等，这是合理的（他们需要处理单个设备）
- 但对于商务人员，应该按**批次**显示工单，因为商务审核是以批次为单位的

---

## ✅ 解决方案

### 1. 创建专门的批次工单列表页面

**新文件**: `app/business/repairs/page.tsx`

重新实现整个页面，专门为商务人员设计：

```tsx
"use client";

import { useEffect, useState } from "react";
// ... imports ...

interface BatchTicket {
  batchId: string;
  projectName: string;
  projectLocation: string;
  deviceCount: number;
  category: string;
  createdAt: string;
  status: string;
}

export default function BusinessRepairsPage() {
  const [batches, setBatches] = useState<BatchTicket[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  
  // 加载所有批次工单
  const loadBatches = async () => {
    const response = await fetch("/api/tickets/all-batches");
    const result = await response.json();
    if (result.success) {
      setBatches(result.data || []);
    }
  };
  
  // 如果选择了批次，显示审核界面
  if (selectedBatchId) {
    return <BusinessBatchReview batchId={selectedBatchId} onBack={...} />;
  }
  
  // 显示批次工单列表
  return (
    <div>
      {batches.map((batch) => (
        <Card key={batch.batchId} onClick={() => setSelectedBatchId(batch.batchId)}>
          <h3>{batch.batchId}</h3>
          <Badge>{batch.status}</Badge>
          <Badge>{batch.deviceCount} 台设备</Badge>
          <p>项目：{batch.projectName}</p>
          <p>类别：{batch.category}</p>
          <p>创建时间：{batch.createdAt}</p>
        </Card>
      ))}
    </div>
  );
}
```

**核心功能**:
- ✅ 显示所有批次工单（不限制状态）
- ✅ 每个批次显示：批次号、状态、设备数量、项目名称、类别、创建时间
- ✅ 点击批次工单进入详情页（复用 `BusinessBatchReview` 组件）
- ✅ 支持搜索（批次号、项目名称、项目位置）
- ✅ 状态徽章可视化

---

### 2. 创建批次工单查询 API

**新文件**: `app/api/tickets/all-batches/route.ts`

```typescript
import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS } from "@/lib/enums"

export async function GET() {
  try {
    const pool = await getDbConnection()

    const result = await pool
      .request()
      .query(`
        SELECT 
          BatchId as batchId,
          MAX(ProjectName) as projectName,
          MAX(ProjectLocation) as projectLocation,
          MAX(Category) as category,
          COUNT(*) as deviceCount,
          MIN(CreatedAt) as createdAt,
          MAX(Status) as status
        FROM Repair_Tickets
        WHERE 
          BatchId IS NOT NULL 
          AND BatchId != ''
        GROUP BY BatchId
        ORDER BY MIN(CreatedAt) DESC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset
    })
  } catch (error: any) {
    console.error("查询所有批次失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "查询失败" },
      { status: 500 }
    )
  }
}
```

**关键点**:
- ✅ 按 `BatchId` 分组
- ✅ 使用 `MAX()` 聚合函数处理其他字段
- ✅ `COUNT(*)` 统计每个批次的设备数量
- ✅ 按创建时间倒序排列（最新的在前）
- ✅ 不限制状态（返回所有批次工单）

---

## 📊 界面对比

### 修复前（错误）

**显示内容**:
```
工单号：N74C1I20
批次号：WO2602263315
序列号：N74C1I20
🕒 控制器失灵
2026-02-26T06:18:01.321Z
[查看详情]

---

工单号：N76J2501
批次号：WO2602263315
序列号：N76J2501
🕒 控制器失灵
2026-02-26T06:18:01.322Z
[查看详情]

---

工单号：K2025040134
批次号：WO2602263315
序列号：K2025040134
🕒 屏幕不亮
2026-02-26T06:18:01.323Z
[查看详情]
```

**问题**:
- ❌ 以单个设备为单位显示
- ❌ 同一个批次被分成多个卡片
- ❌ 商务人员需要多次点击才能处理一个批次
- ❌ 界面混乱，不符合业务逻辑

---

### 修复后（正确）

**显示内容**:
```
工单号：WO2602263315
💰 待商务审核    📦 3 台设备

项目：矿视
类别：控制器
创建时间：02-26 18:25

[点击进入 →]

---

工单号：WO2602263316
✅ 已完成    📦 5 台设备

项目：深圳机场安防
类别：生物识别
创建时间：02-25 14:30

[点击进入 →]
```

**优点**:
- ✅ 以批次为单位显示
- ✅ 一个批次只有一个卡片
- ✅ 清晰显示设备数量
- ✅ 商务人员一次点击即可处理整个批次
- ✅ 界面清晰，符合业务逻辑

---

## 🎯 业务逻辑对比

### 不同角色看到的工单视图

| 角色 | 应该看到的视图 | 原因 |
|------|----------------|------|
| **现场人员** | 批次工单 | 现场人员一次报修多台设备，自然是按批次查看 |
| **仓库人员** | 批次工单 | 仓库收货/发货是按批次处理的 |
| **维修人员** | 单个设备工单 | 维修人员需要逐个设备检查和维修 |
| **商务人员** | **批次工单** ✅ | 商务审核是针对整个批次的，不需要逐个设备审核 |
| **管理员** | 批次工单 + 单个设备工单 | 管理员需要全局视图，可以看到所有类型 |

**商务人员的工作流程**:
1. 查看待审核的批次工单列表
2. 点击某个批次，查看批次详情（包含所有设备）
3. 核对维修费用、签字凭证
4. 确认收款和开票情况
5. 点击"确认收费完结，通知发货"
6. **完成整个批次的审核**（不需要逐个设备审核）

---

## 🔍 页面功能详解

### 1. 搜索功能

支持搜索：
- ✅ 批次号（如 `WO2602263315`）
- ✅ 项目名称（如 `矿视`）
- ✅ 项目位置（如 `深圳机场`）

### 2. 状态徽章

使用不同颜色和图标区分状态：
- 🟡 待处理（Created）
- 🔵 待仓库确认（Warehouse_Confirming）
- 🟢 维修中（In_Repair, Technician_Repairing）
- 🟣 待商务审核（Business_Review）
- 🟠 待发货（Warehouse_Shipping）
- ✅ 已完成（Completed）

### 3. 批次详情

点击批次卡片后，进入 `BusinessBatchReview` 组件：
- ✅ 显示批次基础信息
- ✅ 显示所有设备列表
- ✅ 显示维修费用汇总
- ✅ 显示签字凭证
- ✅ 商务审核操作按钮

---

## 🧪 测试场景

### 场景 1: 查看所有批次工单

**操作**: 访问 `/business/repairs`

**预期结果**:
- ✅ 显示所有批次工单（按创建时间倒序）
- ✅ 每个批次一个卡片
- ✅ 卡片显示：批次号、状态、设备数量、项目、类别、创建时间

---

### 场景 2: 搜索批次工单

**操作**: 在搜索框输入 `WO2602263315`

**预期结果**:
- ✅ 只显示批次号为 `WO2602263315` 的批次工单
- ✅ 其他批次被过滤掉

---

### 场景 3: 点击批次工单

**操作**: 点击某个批次卡片

**预期结果**:
- ✅ 进入批次详情页面
- ✅ 显示 `BusinessBatchReview` 组件
- ✅ 可以看到批次下的所有设备
- ✅ 可以进行商务审核操作

---

### 场景 4: 从详情页返回列表

**操作**: 在批次详情页点击"返回"按钮

**预期结果**:
- ✅ 返回批次工单列表
- ✅ 列表数据自动刷新（包含最新状态）

---

## 📝 API 路由对比

### 之前使用的 API（错误）

- `/api/tickets` - 返回所有单个设备的工单
- 前端直接使用 `RepairContext` 中的 `repairs` 数据

**问题**:
- ❌ 返回的是单个设备工单，不是批次工单
- ❌ 需要前端手动按 `batchId` 分组
- ❌ 性能差（返回大量数据）

---

### 修复后使用的 API（正确）

- `/api/tickets/all-batches` - 返回所有批次工单（已聚合）

**优点**:
- ✅ 返回的直接是批次工单列表
- ✅ 后端已完成聚合和统计
- ✅ 性能好（只返回批次数据）
- ✅ 数据结构清晰

---

## 🔄 与其他页面的对比

### 1. 商务控制台首页 (`/business`)

**相同点**:
- 都显示批次工单列表
- 都可以点击进入 `BusinessBatchReview`

**不同点**:
| 特性 | 首页 | 工单管理页 |
|------|------|-----------|
| **显示范围** | 只显示待审核批次 | 显示所有批次 |
| **状态筛选** | 只显示 `Business_Review` | 显示所有状态 |
| **API** | `/api/tickets/business-pending-batches` | `/api/tickets/all-batches` |
| **目的** | 快速查看待办 | 全局工单管理 |

---

### 2. 现场人员报修页面 (`/report`)

**相同点**:
- 都显示批次工单列表
- 都可以点击进入批次详情

**不同点**:
| 特性 | 现场人员 | 商务人员 |
|------|----------|----------|
| **显示范围** | 只显示自己创建的批次 | 显示所有批次 |
| **操作权限** | 可以创建、编辑、取消 | 只能审核 |
| **详情组件** | `BatchWorkOrderDetail` | `BusinessBatchReview` |

---

## ✅ 修复验证

### Linter 检查
- ✅ 0 个错误
- ✅ TypeScript 类型安全

### 功能测试
- [x] 商务人员访问 `/business/repairs` 显示批次工单列表
- [x] 列表显示所有批次工单（不限制状态）
- [x] 每个批次只显示一个卡片
- [x] 搜索功能正常
- [x] 点击批次进入详情页
- [x] 从详情页返回列表
- [x] 状态徽章显示正确

---

## 📌 总结

### 问题根源
- 商务管理的工单页面直接复用了通用的 `RepairsPage` 组件
- `RepairsPage` 显示的是单个设备工单，不是批次工单
- 不符合商务人员的工作流程（按批次审核）

### 解决方案
- 为商务人员创建专门的批次工单列表页面
- 创建新的 API `/api/tickets/all-batches` 返回所有批次工单
- 复用 `BusinessBatchReview` 组件显示批次详情

### 修复效果
- ✅ 商务人员看到的是批次工单列表（如 `WO2602263315`）
- ✅ 每个批次一个卡片，清晰显示设备数量
- ✅ 符合商务审核的业务流程
- ✅ 界面清晰，易于使用

### 用户价值
- 🎯 **符合业务逻辑**: 商务审核是按批次进行的，界面也按批次显示
- 🎯 **提高效率**: 一次点击即可处理整个批次，不需要逐个设备审核
- 🎯 **清晰明了**: 批次卡片显示关键信息，一目了然
- 🎯 **一致性**: 与商务控制台首页的待审核批次列表保持一致

---

**文档版本**: v1.0  
**最后更新**: 2026-02-26  
**维护者**: AI Assistant
