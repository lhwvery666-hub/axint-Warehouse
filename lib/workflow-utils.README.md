# workflow-utils 开发指南

## 🎯 快速开始

```typescript
import { 
  AggregatedStatus,
  getAggregatedStatus,
  countByAggregatedStatus,
  AGGREGATED_STATUS_CONFIG
} from '@/lib/workflow-utils';
import { TicketStatus } from '@/lib/enums';

// 1. 获取聚合状态
const aggregated = getAggregatedStatus(TicketStatus.IN_REPAIR);
// => AggregatedStatus.IN_REPAIR

// 2. 统计工单
const counts = countByAggregatedStatus(tickets);
console.log(counts[AggregatedStatus.PENDING_RECEIVE]); // => 5

// 3. 获取显示配置
const config = AGGREGATED_STATUS_CONFIG[AggregatedStatus.PENDING_RECEIVE];
console.log(config.label);  // => "待接单"
console.log(config.icon);   // => "📥"
```

## 📋 编码规范

### ✅ 正确做法

```typescript
// 1. 使用枚举，不要硬编码
import { TicketStatus, AggregatedStatus } from '@/lib/enums';

if (status === TicketStatus.CREATED) {  // ✅
  // ...
}

// 2. 使用类型安全的函数
const aggregated = getAggregatedStatus(ticket.status);  // ✅

// 3. 使用配置对象
const { label, icon } = AGGREGATED_STATUS_CONFIG[aggregated];  // ✅
```

### ❌ 错误做法

```typescript
// 1. 禁止硬编码字符串
if (status === "Created") {  // ❌ Magic String
  // ...
}

// 2. 禁止直接判断
if (status === "pending" || status === "processing") {  // ❌
  // ...
}

// 3. 禁止硬编码显示文本
<div>{status === "Created" ? "待接单" : "其他"}</div>  // ❌
```

## 🔒 类型安全检查清单

在提交代码前，请确认：

- [ ] 所有状态使用 `TicketStatus` 枚举
- [ ] 所有聚合状态使用 `AggregatedStatus` 枚举
- [ ] 没有使用字符串字面量判断状态
- [ ] 运行 `npm run type-check` 通过
- [ ] 运行单元测试通过
- [ ] 开发环境启动时没有映射表验证错误

## 🧪 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行 workflow-utils 测试
npm test -- workflow-utils.test.ts

# 监听模式
npm test -- --watch workflow-utils.test.ts
```

### 添加测试

```typescript
// lib/__tests__/workflow-utils.test.ts
it('应该正确处理新状态', () => {
  const result = getAggregatedStatus(TicketStatus.NEW_STATUS);
  expect(result).toBe(AggregatedStatus.EXPECTED);
});
```

## 📝 添加新状态的步骤

### 1. 更新枚举 (lib/enums.ts)

```typescript
export enum TicketStatus {
  // ... 现有状态
  NEW_STATUS = "New_Status",  // 添加新状态
}
```

### 2. 更新映射表 (lib/workflow-utils.ts)

```typescript
export const STATUS_TO_AGGREGATED_MAP: Record<TicketStatus, AggregatedStatus> = {
  // ... 现有映射
  [TicketStatus.NEW_STATUS]: AggregatedStatus.IN_REPAIR,  // 添加映射
};
```

### 3. 运行验证

```bash
# 启动开发服务器
npm run dev

# 检查控制台输出
# ✅ [workflow-utils] 状态映射表验证通过
```

### 4. 更新测试

```typescript
it('应该正确映射新状态', () => {
  expect(getAggregatedStatus(TicketStatus.NEW_STATUS))
    .toBe(AggregatedStatus.IN_REPAIR);
});
```

### 5. 更新文档

更新 `docs/STATUS_AGGREGATION_SYSTEM.md` 中的映射表。

## 🐛 常见问题

### Q: 为什么要使用枚举而不是字符串？

**A:** 类型安全 + IDE 自动完成 + 重构保障

```typescript
// 硬编码字符串的问题
if (status === "Craeted") {  // 拼写错误，运行时才发现 ❌
  // ...
}

// 使用枚举
if (status === TicketStatus.CREATED) {  // 编译时检查 ✅
  // ...
}
```

### Q: 如何处理数据库返回的字符串状态？

**A:** 使用 `normalizeTicketStatus()` 或直接传给 `getAggregatedStatus()`

```typescript
import { normalizeTicketStatus } from '@/lib/enums';

// 方法 1: 手动规范化
const normalized = normalizeTicketStatus(dbStatus);
if (normalized === TicketStatus.CREATED) { ... }

// 方法 2: 直接使用（推荐）
const aggregated = getAggregatedStatus(dbStatus);  // 自动规范化
```

### Q: `STATUS_TO_AGGREGATED_MAP` 缺少状态怎么办？

**A:** 开发环境会自动检测并抛出错误

```
❌ [workflow-utils] 状态映射表验证失败:
Error: [CRITICAL] 状态映射表不完整！缺少以下状态的映射: New_Status
```

立即在 `STATUS_TO_AGGREGATED_MAP` 中添加缺失的映射。

### Q: 性能够吗？能处理多少数据？

**A:** 已测试 10,000 条工单 < 100ms

```typescript
// 性能测试
const largeList = Array.from({ length: 10000 }, ...);
const counts = countByAggregatedStatus(largeList);  // < 100ms
```

如需更高性能，考虑：
- 服务端统计（数据库 `GROUP BY`）
- 缓存统计结果
- 虚拟滚动

## 📚 参考资源

- **技术文档**: [docs/STATUS_AGGREGATION_SYSTEM.md](../docs/STATUS_AGGREGATION_SYSTEM.md)
- **单元测试**: [lib/__tests__/workflow-utils.test.ts](../__tests__/workflow-utils.test.ts)
- **枚举定义**: [lib/enums.ts](./enums.ts)
- **架构规范**: [.cursorrules](../../.cursorrules)

## 🤝 代码审查清单

提交 PR 前，请检查：

- [ ] ✅ 没有硬编码字符串
- [ ] ✅ 使用 TypeScript 枚举
- [ ] ✅ 单元测试通过
- [ ] ✅ 类型检查通过
- [ ] ✅ 开发环境验证通过
- [ ] ✅ 更新相关文档
- [ ] ✅ 添加必要的注释

---

**问题反馈**: 请在 [issues](https://github.com/yourproject/issues) 提交  
**维护者**: 架构组  
**最后更新**: 2026-02-25
