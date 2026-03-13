# 🔧 修复：最终维修状态下序列号可以为空

**日期**: 2026-02-28  
**修复人**: AI Assistant  
**需求**: 序列号如果为空的情况下是"待补录"，但现在有特殊情况：在最终维修时可以不补录，可以为空

---

## 📋 业务需求

### 正常情况
- 序列号为空 → 显示"待补录"提示

### 特殊情况
- **最终维修状态**（`COMPLETED`、`UNREPAIRABLE`、`SCRAPPED`）下：
  - 序列号可以为空
  - **不显示"待补录"提示**
  - 允许不补录序列号

---

## 🔍 终端状态定义

根据 `lib/enums.ts`，终端状态包括：

```typescript
export const TERMINAL_STATUSES: TicketStatus[] = [
  TicketStatus.SCRAPPED,      // 已报废
  TicketStatus.CANCELLED,     // 已取消
  TicketStatus.COMPLETED,     // 已完成
  TicketStatus.UNREPAIRABLE,  // 无法维修
]
```

**最终维修状态**主要指：
- `COMPLETED` - 已完成
- `UNREPAIRABLE` - 无法维修
- `SCRAPPED` - 已报废

---

## ✅ 修复方案

### 修复逻辑

在所有显示"待补录"的地方，添加终端状态判断：

```typescript
// ✅ 修复后
const normalizedStatus = normalizeTicketStatus(status || "")
const isTerminal = TERMINAL_STATUSES.includes(normalizedStatus) // 或使用 isTerminalStatus(status)

const needsSupplement = !isTerminal && (
  !productSN || 
  productSN.trim() === "" || 
  productSN.toUpperCase() === "PENDING" ||
  deviceSerialNumber?.toUpperCase() === "PENDING"
)
```

**逻辑说明**：
- 如果是终端状态 → `needsSupplement = false` → 不显示"待补录"
- 如果不是终端状态 → 按原逻辑判断 → 显示"待补录"

---

## 📁 修复的文件

### 1. `components/repair-detail.tsx`

**修复位置1**: `needsSupplementSN` 判断逻辑（第498-503行）

```typescript
// ✅ 修复后
const normalizedStatus = normalizeTicketStatus(repairData.status || "")
const isTerminal = TERMINAL_STATUSES.includes(normalizedStatus)

const needsSupplementSN = !isTerminal && (
  !repairData.productSN || 
  (typeof repairData.productSN === 'string' && repairData.productSN.trim() === "") || 
  (typeof repairData.productSN === 'string' && repairData.productSN.toUpperCase() === "PENDING") ||
  (typeof repairData.deviceSerialNumber === 'string' && repairData.deviceSerialNumber.toUpperCase() === "PENDING")
)
```

**修复位置2**: 序列号显示（第1538行）

```typescript
// ✅ 修复后
{needsSupplementSN ? <span className="text-warning">待补录</span> : (repairData.productSN || (isTerminal ? "" : "待录入"))}
```

**效果**：
- 终端状态下，序列号为空时显示空字符串（不显示"待录入"）
- 非终端状态下，序列号为空时显示"待录入"

---

### 2. `components/dashboard.tsx`

**修复位置**: "待补录 SN" 提示显示（第693-704行）

```typescript
// ✅ 修复后
{!task.isBatch && (() => {
  const isTerminal = isTerminalStatus(task.status)
  const needsSupplement = !isTerminal && (
    !task.productSN || 
    (typeof task.productSN === 'string' && task.productSN.trim() === "") || 
    (typeof task.productSN === 'string' && task.productSN.toUpperCase() === "PENDING") ||
    (typeof task.deviceSerialNumber === 'string' && task.deviceSerialNumber?.toUpperCase() === "PENDING")
  )
  return needsSupplement ? (
    <span className="text-[11px] text-warning whitespace-nowrap">
      待补录 SN
    </span>
  ) : null
})()}
```

---

### 3. `components/repair-page.tsx`

**修复位置**: "待补录 SN" 提示显示（第634-645行）

```typescript
// ✅ 修复后
{(() => {
  const isTerminal = isTerminalStatus(task.status)
  const needsSupplement = !isTerminal && (
    !task.productSN || 
    (typeof task.productSN === 'string' && task.productSN.trim() === "") || 
    (typeof task.productSN === 'string' && task.productSN.toUpperCase() === "PENDING") ||
    (typeof task.deviceSerialNumber === 'string' && task.deviceSerialNumber?.toUpperCase() === "PENDING")
  )
  return needsSupplement ? (
    <span className="text-[11px] text-warning whitespace-nowrap">
      待补录 SN
    </span>
  ) : null
})()}
```

---

### 4. `app/report/page.tsx`

**修复位置**: "待补录 SN" 提示显示（第732-743行）

```typescript
// ✅ 修复后
{(() => {
  const isTerminal = isTerminalStatus(task.status)
  const needsSupplement = !isTerminal && (
    !task.productSN || 
    task.productSN.trim() === "" || 
    task.productSN.toUpperCase() === "PENDING" ||
    task.deviceSerialNumber?.toUpperCase() === "PENDING"
  )
  return needsSupplement ? (
    <span className="text-[11px] text-warning whitespace-nowrap">
      待补录 SN
    </span>
  ) : null
})()}
```

---

### 5. `components/batch-work-order-detail.tsx`

**修复位置**: `formatSerialNumber` 函数（第231-236行）

```typescript
// ✅ 修复后
const formatSerialNumber = (sn: string | null | undefined) => {
  const normalizedStatus = normalizeTicketStatus(batchInfo?.status || "")
  const isTerminal = TERMINAL_STATUSES.includes(normalizedStatus)
  
  if (!sn || sn.trim() === "" || sn.toUpperCase() === "PENDING_VERIFY" || sn === "待验证") {
    // 最终维修状态下，序列号可以为空，返回空字符串
    return isTerminal ? "" : "未填写"
  }
  return sn
}
```

**效果**：
- 终端状态下，序列号为空时返回空字符串（表格中不显示任何内容）
- 非终端状态下，序列号为空时返回"未填写"

---

## 🎯 修复效果

### 修复前

| 状态 | 序列号为空 | 显示 |
|------|-----------|------|
| `CREATED` | ✅ | "待补录 SN" |
| `IN_REPAIR` | ✅ | "待补录 SN" |
| `COMPLETED` | ✅ | "待补录 SN" ❌ **错误** |
| `UNREPAIRABLE` | ✅ | "待补录 SN" ❌ **错误** |

### 修复后

| 状态 | 序列号为空 | 显示 |
|------|-----------|------|
| `CREATED` | ✅ | "待补录 SN" ✅ |
| `IN_REPAIR` | ✅ | "待补录 SN" ✅ |
| `COMPLETED` | ✅ | **不显示** ✅ **正确** |
| `UNREPAIRABLE` | ✅ | **不显示** ✅ **正确** |
| `SCRAPPED` | ✅ | **不显示** ✅ **正确** |

---

## ✅ 符合规范

- ✅ **NO Magic Strings**: 使用 `TERMINAL_STATUSES` 枚举和 `isTerminalStatus()` 函数
- ✅ **Type Safety**: 所有状态判断都是类型安全的
- ✅ **Business Logic**: 符合业务需求，最终维修状态下允许序列号为空

---

## 🧪 测试验证

### 测试场景1：正常状态（非终端）
1. **创建一个工单，序列号为空**
2. **状态为 `CREATED` 或 `IN_REPAIR`**
3. **验证**：✅ 显示"待补录 SN"提示

### 测试场景2：最终维修状态（终端）
1. **工单状态为 `COMPLETED`**
2. **序列号为空**
3. **验证**：✅ **不显示"待补录 SN"提示**

### 测试场景3：无法维修状态
1. **工单状态为 `UNREPAIRABLE`**
2. **序列号为空**
3. **验证**：✅ **不显示"待补录 SN"提示**

### 测试场景4：批次工单详情页
1. **进入批次工单详情页**
2. **状态为 `COMPLETED`**
3. **设备序列号为空**
4. **验证**：✅ 表格中序列号列显示为空（不显示"未填写"）

---

**修复完成！最终维修状态下序列号可以为空，不显示"待补录"！** ✅
