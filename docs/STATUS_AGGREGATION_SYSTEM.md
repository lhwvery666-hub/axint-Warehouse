# 工单状态聚合系统设计文档

## 📋 概述

本文档描述工单状态聚合系统的设计、实现和使用方法。该系统将 26+ 个详细的工单状态聚合为 7 个业务阶段，简化用户界面展示和数据筛选。

## 🎯 设计目标

1. **简化用户体验** - 用户无需理解复杂的内部状态，只需关注业务阶段
2. **类型安全** - 使用 TypeScript 枚举和类型系统，避免硬编码字符串
3. **可维护性** - 集中管理状态映射关系，易于扩展
4. **健壮性** - 完善的错误处理和运行时验证
5. **性能** - 支持大数据量的高效统计

## 📊 状态聚合映射

### 聚合状态定义

```typescript
export enum AggregatedStatus {
  PENDING_RECEIVE = "pending_receive",    // 📥 待接单
  IN_REPAIR = "in_repair",                // 🔧 维修中
  PENDING_SIGNATURE = "pending_signature", // ✍️ 待签字
  PENDING_REVIEW = "pending_review",       // 📋 待审核
  PENDING_SHIPPING = "pending_shipping",   // 📦 待发货
  COMPLETED = "completed",                 // ✅ 已完成
  ABNORMAL = "abnormal",                   // ⚠️ 异常
}
```

### 映射关系

| 聚合状态 | 包含的详细状态 | 业务含义 |
|---------|-------------|---------|
| 📥 **待接单** | `CREATED`, `WAREHOUSE_CONFIRMING`, `PENDING` | 工单刚创建，等待仓库确认收货 |
| 🔧 **维修中** | `WAREHOUSE_CONFIRMED`, `IN_REPAIR`, `TECHNICIAN_REPAIRING`, `PROCESSING` 等 | 维修人员正在检查或维修设备 |
| ✍️ **待签字** | `PENDING_REPORTER_CONFIRM`, `CUSTOMER_CONFIRM` | 维修完成，等待现场人员签字确认 |
| 📋 **待审核** | `BUSINESS_REVIEW`, `ADMIN_REVIEW`, `PENDING_PAYMENT` | 等待商务部门审核收款和开票 |
| 📦 **待发货** | `WAREHOUSE_SHIPPING`, `PENDING_SHIPMENT` | 等待仓库发货返还设备 |
| ✅ **已完成** | `COMPLETED` | 工单完整流程结束 |
| ⚠️ **异常** | `UNREPAIRABLE`, `CANCELLED`, `SCRAPPED`, `DELETED` 等 | 非正常结束的工单 |

## 🔧 核心 API

### `getAggregatedStatus(status)`

将详细状态映射到聚合状态。

```typescript
import { getAggregatedStatus } from '@/lib/workflow-utils';
import { TicketStatus } from '@/lib/enums';

// 使用枚举
const aggregated = getAggregatedStatus(TicketStatus.IN_REPAIR);
// => AggregatedStatus.IN_REPAIR

// 使用字符串（自动规范化）
const aggregated2 = getAggregatedStatus('In_Repair');
// => AggregatedStatus.IN_REPAIR

// 处理空值
const aggregated3 = getAggregatedStatus(null);
// => AggregatedStatus.ABNORMAL
```

**特性：**
- ✅ 自动规范化字符串状态
- ✅ 处理空值和无效值
- ✅ 开发环境输出警告日志

### `countByAggregatedStatus(tickets)`

统计工单列表中各聚合状态的数量。

```typescript
import { countByAggregatedStatus, AggregatedStatus } from '@/lib/workflow-utils';

const tickets = await fetchTickets();
const counts = countByAggregatedStatus(tickets);

console.log(`待接单: ${counts[AggregatedStatus.PENDING_RECEIVE]}`);
console.log(`维修中: ${counts[AggregatedStatus.IN_REPAIR]}`);
```

**特性：**
- ✅ 兼容 `status` 和 `Status` 字段
- ✅ 处理空值和 null 项
- ✅ 高性能（10,000 条数据 < 100ms）

### `getAggregatedStatusInfo(status)`

获取聚合状态的显示配置。

```typescript
import { getAggregatedStatusInfo, AggregatedStatus } from '@/lib/workflow-utils';

const info = getAggregatedStatusInfo(AggregatedStatus.PENDING_RECEIVE);
// => { label: "待接单", color: "blue", icon: "📥", description: "..." }
```

### `validateStatusMapping()`

验证映射表的完整性（开发环境自动调用）。

```typescript
import { validateStatusMapping } from '@/lib/workflow-utils';

// 手动验证
validateStatusMapping();
// 如果映射表缺少状态，会抛出错误
```

## 🛡️ 类型安全机制

### 1. 编译时验证

使用 TypeScript 类型系统确保映射表类型安全：

```typescript
export const STATUS_TO_AGGREGATED_MAP: Record<TicketStatus, AggregatedStatus> = {
  // TypeScript 会检查是否所有 TicketStatus 都被映射
  [TicketStatus.CREATED]: AggregatedStatus.PENDING_RECEIVE,
  // ...
};
```

### 2. 运行时验证

开发环境启动时自动验证：

```typescript
if (process.env.NODE_ENV === "development") {
  validateStatusMapping();
  // ✅ 映射表完整
  // ❌ 抛出错误：缺少状态映射
}
```

## 🧪 测试覆盖

完整的单元测试覆盖，包括：

- ✅ 映射表完整性验证
- ✅ 标准状态映射
- ✅ 兼容旧状态
- ✅ 边界情况（空值、无效值）
- ✅ 性能测试（10,000 条数据）

运行测试：

```bash
npm test -- workflow-utils.test.ts
```

## 📝 使用指南

### 在 UI 组件中使用

```typescript
import { 
  AggregatedStatus, 
  getAggregatedStatus,
  countByAggregatedStatus 
} from '@/lib/workflow-utils';

export default function TicketList() {
  const [tickets, setTickets] = useState([]);
  
  // 统计各状态数量
  const counts = countByAggregatedStatus(tickets);
  
  // 筛选特定状态
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const filteredTickets = tickets.filter(ticket => {
    if (filterStatus === "all") return true;
    return getAggregatedStatus(ticket.status) === filterStatus;
  });
  
  return (
    <>
      {/* 状态统计卡片 */}
      <StatusCard 
        count={counts[AggregatedStatus.PENDING_RECEIVE]}
        label="待接单"
        onClick={() => setFilterStatus(AggregatedStatus.PENDING_RECEIVE)}
      />
      
      {/* 工单列表 */}
      {filteredTickets.map(ticket => <TicketItem {...ticket} />)}
    </>
  );
}
```

### 添加新状态

1. 在 `lib/enums.ts` 中添加新的 `TicketStatus`
2. 在 `STATUS_TO_AGGREGATED_MAP` 中添加映射关系
3. 运行测试确保没有遗漏

```typescript
// lib/enums.ts
export enum TicketStatus {
  // ... 现有状态
  NEW_STATUS = "New_Status",  // 新增状态
}

// lib/workflow-utils.ts
export const STATUS_TO_AGGREGATED_MAP: Record<TicketStatus, AggregatedStatus> = {
  // ... 现有映射
  [TicketStatus.NEW_STATUS]: AggregatedStatus.IN_REPAIR,  // 新增映射
};
```

开发服务器会自动验证并提示是否完整。

## 🚀 性能优化

### 映射表查找

使用 O(1) 的对象查找，而非数组遍历：

```typescript
// ❌ 性能差（O(n)）
if (pendingStatuses.includes(status)) { ... }

// ✅ 性能好（O(1)）
return STATUS_TO_AGGREGATED_MAP[status];
```

### 统计优化

单次遍历完成所有状态统计：

```typescript
tickets.forEach(ticket => {
  const aggregated = getAggregatedStatus(ticket.status);
  counts[aggregated]++;
});
```

性能基准：10,000 条工单 < 100ms

## ⚠️ 注意事项

### 1. 禁止硬编码

❌ **错误做法：**
```typescript
if (status === "Created") { ... }  // Magic String
```

✅ **正确做法：**
```typescript
import { TicketStatus } from '@/lib/enums';
if (status === TicketStatus.CREATED) { ... }
```

### 2. 状态变更流程

修改状态相关代码时，必须：

1. 更新 `lib/enums.ts` 中的枚举
2. 更新 `STATUS_TO_AGGREGATED_MAP` 映射
3. 运行 `validateStatusMapping()` 验证
4. 更新单元测试
5. 更新本文档

### 3. 数据库兼容性

确保数据库中的状态字符串与 `TicketStatus` 枚举值一致：

```sql
-- 数据库中的值
UPDATE Repair_Tickets SET Status = 'Created';  -- ✅ 匹配 TicketStatus.CREATED

UPDATE Repair_Tickets SET Status = 'created';  -- ⚠️ 需要规范化
```

## 📚 相关资源

- [工单状态枚举定义](../lib/enums.ts)
- [工作流工具函数](../lib/workflow-utils.ts)
- [单元测试](../lib/__tests__/workflow-utils.test.ts)
- [批次工作流系统](./BATCH_WORKFLOW_SYSTEM.md)

## 🔄 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-25 | 初始版本，支持 7 个聚合状态 |

---

**维护者：** 系统架构组  
**最后更新：** 2026-02-25
