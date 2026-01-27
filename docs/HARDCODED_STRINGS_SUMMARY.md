# 硬编码字符串扫描总结

## 📊 统计概览

- **总文件数**：20+ 个文件需要重构
- **硬编码类型**：
  - 工单状态字符串：15+ 种状态
  - 用户角色字符串：5 种角色 + 多种中文变体
  - 路由路径：10+ 条路径
  - 数据库字段名：30+ 个字段
  - API 路径：10+ 条路径
  - 特殊值：2+ 个特殊值

---

## 📁 文件分类清单

### 🔴 核心 API 路由（4 个文件）

| 文件路径 | 硬编码数量 | 主要硬编码内容 |
|---------|-----------|---------------|
| `app/api/tickets/[id]/update/route.ts` | 30+ | 状态值、角色、字段名、操作类型 |
| `app/api/tickets/[id]/route.ts` | 20+ | 状态映射、字段名 |
| `app/api/tickets/route.ts` | 15+ | 状态映射 |
| `app/api/tickets/create/route.ts` | 5+ | 状态值、特殊值 |

### 🟡 核心组件（5 个文件）

| 文件路径 | 硬编码数量 | 主要硬编码内容 |
|---------|-----------|---------------|
| `components/repair-detail.tsx` | 40+ | 状态比较、角色比较、取消申请状态 |
| `components/dashboard.tsx` | 25+ | 状态比较、角色比较 |
| `components/repair-page.tsx` | 15+ | 状态比较 |
| `components/repairs-panel.tsx` | 20+ | 状态筛选、状态比较 |
| `lib/workflow-utils.ts` | 15+ | 状态值、角色值、终止状态 |

### 🟢 页面和布局（6 个文件）

| 文件路径 | 硬编码数量 | 主要硬编码内容 |
|---------|-----------|---------------|
| `app/business/page.tsx` | 10+ | 状态筛选 |
| `app/business/layout.tsx` | 5+ | 角色、路由 |
| `app/admin/layout.tsx` | 5+ | 角色、路由 |
| `app/page.tsx` | 8+ | 角色、路由 |
| `app/warehouse/tickets/page.tsx` | 10+ | 状态筛选 |
| `app/repairs/page.tsx` | 15+ | 状态比较、角色、路由 |

### 🔵 工具和上下文（5 个文件）

| 文件路径 | 硬编码数量 | 主要硬编码内容 |
|---------|-----------|---------------|
| `context/auth-context.tsx` | 20+ | 角色映射、路由 |
| `components/repair-form.tsx` | 3+ | 特殊值 |
| `components/workflow-progress.tsx` | 5+ | 状态比较（如果存在） |
| `app/api/tickets/export/route.ts` | 10+ | 字段映射 |
| `components/admin/user-manager.tsx` | 8+ | 角色标签 |

---

## 🎯 硬编码模式识别

### 模式 1：状态字符串比较
```typescript
// 常见模式
status === "Created" || status === "created"
status === "In_Repair" || status === "in_repair"
status.toLowerCase() === "admin_review"
```

### 模式 2：角色字符串比较
```typescript
// 常见模式
user?.role === "technician"
user?.role === "admin" || user?.role === "business"
userRole === "warehouse"
```

### 模式 3：状态数组筛选
```typescript
// 常见模式
repairs.filter(r => r.status === "created" || r.status === "pending")
repairs.filter(r => r.status === "admin_review")
```

### 模式 4：路由路径
```typescript
// 常见模式
router.push("/business")
router.push("/admin/users")
href="/repairs?status=admin_review"
```

### 模式 5：数据库字段名
```typescript
// 常见模式
mapColumn("DeviceSN", "DeviceSN")
mapColumn("Status", "Status")
mapColumn("CancelRequestStatus", "CancelRequestStatus")
```

---

## ✅ 已创建的解决方案

### 1. 枚举文件：`lib/enums.ts`
- ✅ `TicketStatus` - 所有工单状态枚举
- ✅ `UserRole` - 所有用户角色枚举
- ✅ `CancelRequestStatus` - 取消申请状态枚举
- ✅ `TicketActionType` - 工单操作类型枚举
- ✅ `ROUTES` - 路由路径常量
- ✅ `API_ROUTES` - API 路径常量
- ✅ `DB_FIELDS` - 数据库字段名称常量
- ✅ `SPECIAL_VALUES` - 特殊值常量
- ✅ 工具函数：`normalizeTicketStatus`, `normalizeUserRole`, `isTerminalStatus`, `isValidTicketStatus`

### 2. 文档文件
- ✅ `docs/REFACTORING_HARDCODED_STRINGS.md` - 详细重构清单
- ✅ `docs/REFACTORING_EXAMPLES.md` - 重构示例详解
- ✅ `docs/HARDCODED_STRINGS_SUMMARY.md` - 本文档（总结）

---

## 📋 重构优先级建议

### 阶段 1：核心 API（必须优先）
1. `app/api/tickets/[id]/update/route.ts` ⭐⭐⭐
2. `app/api/tickets/[id]/route.ts` ⭐⭐⭐
3. `app/api/tickets/route.ts` ⭐⭐
4. `app/api/tickets/create/route.ts` ⭐⭐

### 阶段 2：核心组件（高优先级）
5. `components/repair-detail.tsx` ⭐⭐⭐
6. `components/dashboard.tsx` ⭐⭐⭐
7. `lib/workflow-utils.ts` ⭐⭐⭐
8. `components/repair-page.tsx` ⭐⭐
9. `components/repairs-panel.tsx` ⭐⭐

### 阶段 3：页面和布局（中优先级）
10. `app/business/page.tsx` ⭐⭐
11. `app/business/layout.tsx` ⭐
12. `app/admin/layout.tsx` ⭐
13. `app/page.tsx` ⭐
14. `app/warehouse/tickets/page.tsx` ⭐
15. `app/repairs/page.tsx` ⭐

### 阶段 4：工具和上下文（低优先级）
16. `context/auth-context.tsx` ⭐
17. `components/repair-form.tsx` ⭐
18. `app/api/tickets/export/route.ts` ⭐
19. `components/admin/user-manager.tsx` ⭐
20. `components/workflow-progress.tsx` ⭐

---

## 🔍 快速查找硬编码的方法

### 使用 grep 命令查找状态硬编码：
```bash
# 查找状态字符串
grep -r "status.*===.*['\"]" app/ components/ --include="*.ts" --include="*.tsx"

# 查找角色字符串
grep -r "role.*===.*['\"]" app/ components/ --include="*.ts" --include="*.tsx"

# 查找路由路径
grep -r "router.push\|href=.*['\"]/" app/ components/ --include="*.ts" --include="*.tsx"
```

---

## 📝 重构检查清单模板

重构每个文件时，请检查：

- [ ] 导入枚举：`import { TicketStatus, UserRole, ... } from "@/lib/enums"`
- [ ] 替换状态比较：使用 `normalizeTicketStatus()` 和枚举
- [ ] 替换角色比较：使用 `normalizeUserRole()` 和枚举
- [ ] 替换路由路径：使用 `ROUTES` 常量
- [ ] 替换 API 路径：使用 `API_ROUTES` 常量
- [ ] 替换字段名称：使用 `DB_FIELDS` 常量
- [ ] 替换特殊值：使用 `SPECIAL_VALUES` 常量
- [ ] 移除重复的状态映射逻辑
- [ ] 测试功能是否正常
- [ ] 检查 TypeScript 类型错误

---

## 🚀 开始重构

1. **阅读文档**：
   - 先阅读 `docs/REFACTORING_HARDCODED_STRINGS.md` 了解详细清单
   - 参考 `docs/REFACTORING_EXAMPLES.md` 查看重构示例

2. **从核心 API 开始**：
   - 先重构 `app/api/tickets/[id]/update/route.ts`
   - 这是最核心的文件，影响最大

3. **逐步推进**：
   - 按阶段进行，不要一次性修改所有文件
   - 每个文件重构后都要测试

4. **保持兼容**：
   - 使用 `normalizeTicketStatus` 和 `normalizeUserRole` 确保向后兼容
   - 数据库中的旧状态值仍然可以正常工作

---

## 📚 相关文件

- `lib/enums.ts` - 枚举和常量定义（**核心文件**）
- `docs/REFACTORING_HARDCODED_STRINGS.md` - 详细重构清单
- `docs/REFACTORING_EXAMPLES.md` - 重构示例详解
