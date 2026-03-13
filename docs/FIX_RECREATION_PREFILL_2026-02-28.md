# 修复重新编辑功能预填充问题

## 📋 修复日期
2026-02-28

## 🐛 报告的问题

用户反馈在"修改并重新提交"功能中遇到以下问题：

1. **联系人信息未正确分离**：
   - 联系人姓名和电话合并显示
   - 无法正确解析 `ContactInfo` 字段（格式：`"联系人姓名 电话号码"`）

2. **物流信息未清空**：
   - 旧工单的物流单号和快递公司不应保留
   - 应要求用户重新填写新的物流信息

3. **状态映射缺失错误**：
   - Console Error: `[CRITICAL] 状态映射表不完整！缺少以下状态的映射: Pending_Reporter_Revision`
   - 新增的 `PENDING_REPORTER_REVISION` 状态未添加到必要的映射表中

---

## ✅ 修复内容

### 1. 修复状态映射缺失 (`lib/workflow-utils.ts`)

**问题根因**：
- 新增了 `TicketStatus.PENDING_REPORTER_REVISION` 状态（退回修改）
- 但 `STATUS_TO_AGGREGATED_MAP` 和 `STATUS_PRIORITY` 映射表未同步更新
- 导致运行时验证函数 `validateStatusMapping()` 抛出错误

**修复方案**：

#### 添加到 `STATUS_TO_AGGREGATED_MAP`：
```typescript
// 退回修改，回到待报告人重新填写阶段
[TicketStatus.PENDING_REPORTER_REVISION]: AggregatedStatus.PENDING_RECEIVE,
```

#### 添加到 `STATUS_PRIORITY`：
```typescript
// 退回修改状态（优先级0，因为需要重新走流程）
[TicketStatus.PENDING_REPORTER_REVISION]: 0,
```

**设计考虑**：
- **聚合状态**：`PENDING_RECEIVE`（待接单），因为退回后需要报告人重新处理
- **优先级**：`0`（最低），因为退回表示流程需要从头开始

---

### 2. 修复联系人信息解析 (`components/batch-work-order-detail.tsx`)

**问题根因**：
- 数据库 `ContactInfo` 字段格式：`"联系人姓名 电话号码"`（空格分隔）
- 原代码使用 `/` 分割：`split('/')`
- 导致无法正确解析联系人和电话

**修复方案**：

#### 智能解析 `ContactInfo`：
```typescript
contactPerson: (() => {
  const info = batchInfo?.contactInfo || "";
  // 尝试用空格分割
  const parts = info.trim().split(/\s+/);
  return parts.length > 1 ? parts[0] : "";
})(),
contactPhone: (() => {
  const info = batchInfo?.contactInfo || "";
  // 尝试用空格分割
  const parts = info.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : info;
})(),
```

**解析逻辑**：
1. 使用正则 `/\s+/` 匹配一个或多个空白字符（兼容多个空格/制表符）
2. **联系人**：取第一个部分（`parts[0]`）
3. **电话**：取剩余所有部分（`parts.slice(1).join(" ")`）
4. **容错**：如果只有一个部分，电话显示完整的 `ContactInfo`

**示例**：
- 输入：`"黄工 13512011477"`
  - 联系人：`"黄工"`
  - 电话：`"13512011477"`
- 输入：`"张工  135  1201  1477"`（多个空格）
  - 联系人：`"张工"`
  - 电话：`"135 1201 1477"`

---

### 3. 预填充物流信息（修复）

**设计考虑**：
- 用户反馈：快递单号和快递公司应该保留（不应清空）
- 修改后的工单可能使用相同的物流单号，应预填充以提高效率

**修复方案**：

#### API 层修复 (`app/api/tickets/batch-devices/[batchId]/route.ts`)：
```typescript
// ✅ 添加物流字段到查询
let selectFields = `
  ...
  ${DB_FIELDS.TRACKING_NUMBER_IN},
  ${DB_FIELDS.COURIER_COMPANY},
  ...
`

// ✅ 添加到返回的 batchInfo
const batchInfo = {
  ...
  trackingNumber: result.recordset[0][DB_FIELDS.TRACKING_NUMBER_IN] || result.recordset[0].TrackingNumber_In || "",
  expressCompany: result.recordset[0][DB_FIELDS.COURIER_COMPANY] || result.recordset[0].CourierCompany || "",
}
```

#### 前端层修复 (`components/batch-work-order-detail.tsx`)：
```typescript
// ✅ 从 batchInfo 获取物流信息
trackingNumber: batchInfo?.trackingNumber || "",
expressCompany: batchInfo?.expressCompany || "",
```

#### TypeScript 类型定义：
```typescript
interface BatchInfo {
  ...
  trackingNumber?: string
  expressCompany?: string
}
```

---

## 🎯 修复效果

### 修复前：
1. ❌ Console Error: 状态映射缺失
2. ❌ 联系人信息显示为："黄工 13512011477"（合并显示）
3. ❌ 电话字段为空
4. ❌ 快递单号未预填充

### 修复后：
1. ✅ 无控制台错误
2. ✅ 联系人字段正确显示："黄工"
3. ✅ 电话字段正确显示："13512011477"
4. ✅ 快递单号和快递公司正确预填充

---

## 📊 涉及文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `lib/workflow-utils.ts` | 新增映射 | 添加 `PENDING_REPORTER_REVISION` 到状态映射表和优先级表 |
| `components/batch-work-order-detail.tsx` | 修复逻辑 | 修复 `ContactInfo` 解析和物流信息预填充 |
| `app/api/tickets/batch-devices/[batchId]/route.ts` | 新增字段 | 添加 `trackingNumber` 和 `expressCompany` 到 API 返回 |

---

## 🧪 测试建议

1. **状态映射测试**：
   ```bash
   # 启动开发服务器，确保无控制台错误
   npm run dev
   ```

2. **联系人解析测试**：
   - 创建一个已取消的工单（ContactInfo: `"测试人员 13800138000"`）
   - 点击"修改并重新提交"
   - 验证：
     - 客户名称：正确预填充
     - 联系人姓名：`"测试人员"`
     - 联系电话：`"13800138000"`
     - 项目名称：正确预填充
     - 寄件地址：正确预填充
     - 快递单号：**正确预填充**（如：`SF1234567890`）
     - 快递公司：**正确预填充**（如：`顺丰速运`）

3. **设备信息测试**：
   - 三级分类（Category / SubCategory / Model）正确预填充
   - 序列号正确显示（"待验证" 而非 "PENDING_VERIFY"）
   - 故障描述正确预填充

---

## 🔗 相关功能

- **取消工单功能**（`app/api/tickets/batch-cancel/[batchId]/route.ts`）
- **删除工单功能**（`app/api/tickets/batch-delete/[batchId]/route.ts`）
- **退回修改功能**（`app/api/tickets/reject-to-reporter/[batchId]/route.ts`）
- **工单详情页**（`components/batch-work-order-detail.tsx`）
- **工单表单**（`components/repair-form.tsx`）

---

## 🎓 技术要点

### 1. 正则表达式分割
```typescript
// 使用 \s+ 匹配任意数量的空白字符
const parts = info.trim().split(/\s+/);
```

### 2. IIFE（立即执行函数表达式）
```typescript
// 在 JSX 中执行复杂逻辑并返回值
contactPerson: (() => {
  // 逻辑代码
  return result;
})(),
```

### 3. TypeScript 枚举完整性验证
```typescript
// 编译时验证
type ValidateStatusMapping = {
  [K in TicketStatus]: K extends keyof typeof STATUS_TO_AGGREGATED_MAP ? true : never;
};

// 运行时验证
export function validateStatusMapping(): void {
  const allStatuses = Object.values(TicketStatus);
  const mappedStatuses = Object.keys(STATUS_TO_AGGREGATED_MAP);
  const missingStatuses = allStatuses.filter(status => !mappedStatuses.includes(status));
  if (missingStatuses.length > 0) {
    throw new Error(`状态映射表不完整！缺少: ${missingStatuses.join(", ")}`);
  }
}
```

---

## 📝 备注

1. **数据格式统一性**：
   - 建议后端 API 返回时就分离 `contactPerson` 和 `contactPhone`
   - 当前前端解析方案是权宜之计，应在后续版本中优化

2. **物流信息管理**：
   - 当前设计保留原物流单号，用户可修改
   - 适用于修改工单但使用同一批快递的场景

3. **状态映射扩展性**：
   - 每次新增 `TicketStatus` 时，务必同步更新：
     - `TICKET_STATUS_LABELS`
     - `TICKET_STATUS_MAP`
     - `STATUS_TO_AGGREGATED_MAP` ⚠️
     - `STATUS_PRIORITY` ⚠️
     - `VALID_TICKET_STATUSES`

---

## ✅ 验收标准

- [x] 无控制台错误
- [x] 联系人和电话正确分离显示
- [x] 物流信息正确预填充
- [x] 三级分类和序列号正确预填充
- [x] 符合 `.cursorrules` 规范（无 `any` 类型，无硬编码字符串）
