# Raw SQL 审计报告

**生成时间**：2026-02-03  
**审计范围**：`axiom-repair/app/api/` 目录  
**规则依据**：`.cursorrules` - 禁止使用 raw SQL，必须使用 Prisma ORM

---

## 📊 审计结果总览

| 类别 | 文件数 | 优先级 |
|------|--------|--------|
| **需要修复** | 21 | 🔴 高 |
| **已修复** | 2 | ✅ |
| **符合规范** | 0 | ✅ |

---

## 🔴 需要修复的文件清单

### 一、认证相关 (Authentication) - 优先级：🔴 高

#### 1. `app/api/auth/login/route.ts`
**问题**：
- 使用 `mssql` raw SQL 查询用户
- 手动拼接 SQL 语句

**影响**：
- 用户无法登录时，调试困难
- 存在 SQL 注入风险（虽然有参数化）

**修复建议**：
```typescript
// ❌ 当前
const result = await pool.request()
  .input('username', username)
  .query(`SELECT * FROM Users WHERE Username = @username`)

// ✅ 应改为
const user = await prisma.users.findUnique({
  where: { username: username }
})
```

---

#### 2. `app/api/auth/register/route.ts`
**问题**：
- 使用 raw SQL INSERT 创建用户

**修复建议**：
```typescript
// ❌ 当前
await pool.request()
  .input('username', username)
  .input('password', hashedPassword)
  .query(`INSERT INTO Users (Username, Password, Role) VALUES (...)`)

// ✅ 应改为
await prisma.users.create({
  data: {
    username,
    password: hashedPassword,
    role: 'Reporter'
  }
})
```

---

#### 3. `app/api/auth/me/route.ts`
**问题**：
- 使用 raw SQL 查询当前用户信息

---

### 二、用户管理 (Users) - 优先级：🔴 高

#### 4. `app/api/users/route.ts`
**问题**：
- GET：使用 raw SQL 查询所有用户
- POST：使用 raw SQL 创建用户

**修复建议**：
```typescript
// ✅ GET
const users = await prisma.users.findMany({
  where: { isDeleted: false },
  orderBy: { createdAt: 'desc' }
})

// ✅ POST
await prisma.users.create({ data: { ... } })
```

---

#### 5. `app/api/users/[id]/route.ts`
**问题**：
- GET：raw SQL 查询单个用户
- PUT：raw SQL 更新用户
- DELETE：raw SQL 软删除用户

---

### 三、工单管理 (Tickets) - 优先级：🔴 高（核心业务）

#### 6. `app/api/tickets/route.ts`
**问题**：
- 使用 raw SQL 查询所有工单
- 复杂的 JOIN 查询（关联 Device_Inventory）

**修复建议**：
```typescript
// ✅ 使用 Prisma 关联查询
const tickets = await prisma.repair_Tickets.findMany({
  include: {
    // 如果有关联关系，可以自动 JOIN
  }
})
```

---

#### 7. `app/api/tickets/create/route.ts`
**问题**：
- 使用 raw SQL INSERT 创建工单
- 使用 raw SQL 查询 Device_Inventory
- 使用 raw SQL UPDATE 设备状态

**影响**：
- 核心业务流程，bug 影响大

---

#### 8. `app/api/tickets/[id]/route.ts`
**问题**：
- GET：raw SQL 查询单个工单详情
- PUT：raw SQL 更新工单
- DELETE：raw SQL 删除工单

---

#### 9. `app/api/tickets/[id]/update/route.ts`
**问题**：
- 复杂的工单更新逻辑（状态流转）
- 多个 raw SQL UPDATE 语句
- 序列号验证使用 raw SQL
- 设备状态更新使用 raw SQL

**影响**：
- 工单状态流转核心逻辑
- 涉及多表操作，需要事务

---

#### 10. `app/api/tickets/batch/route.ts`
**问题**：
- 批量创建工单使用 raw SQL
- INSERT 语句拼接

**已知问题**：
- 字段名不匹配（Warehouse vs Location）

---

#### 11. `app/api/tickets/[id]/customer-confirm/route.ts`
**问题**：
- 客户确认逻辑使用 raw SQL

---

#### 12. `app/api/tickets/[id]/generate-repair-report/route.ts`
**问题**：
- 生成维修报告使用 raw SQL

---

#### 13. `app/api/tickets/[id]/repair-report/route.ts`
**问题**：
- 维修报告查询使用 raw SQL

---

#### 14. `app/api/tickets/[id]/set-manufacture-date/route.ts`
**问题**：
- 设置生产日期使用 raw SQL UPDATE

---

#### 15. `app/api/tickets/confirm-replace/route.ts`
**问题**：
- 确认更换设备使用 raw SQL
- 涉及多表操作（Repair_Tickets + Device_Inventory）

---

#### 16. `app/api/tickets/request-replace/route.ts`
**问题**：
- 申请更换设备使用 raw SQL

---

#### 17. `app/api/tickets/export/route.ts`
**问题**：
- 导出工单使用 raw SQL 查询

---

#### 18. `app/api/tickets/export-excel/route.ts`
**问题**：
- Excel 导出使用 raw SQL

---

### 四、系统配置 (System Config) - 优先级：🟡 中

#### 19. `app/api/system-config/route.ts`
**问题**：
- 使用 raw SQL 查询/更新系统配置

**修复建议**：
```typescript
// ✅ GET
const configs = await prisma.system_Config.findMany()

// ✅ PUT
await prisma.system_Config.upsert({
  where: { configKey: key },
  update: { configValue: value },
  create: { configKey: key, configValue: value }
})
```

---

### 五、统计分析 (Statistics) - 优先级：🟡 中

#### 20. `app/api/statistics/route.ts`
**问题**：
- 使用 raw SQL 聚合查询（GROUP BY, COUNT）

**修复建议**：
```typescript
// ✅ 使用 Prisma 聚合
const stats = await prisma.repair_Tickets.groupBy({
  by: ['status'],
  _count: true
})
```

---

### 六、设备管理 (Devices) - 优先级：🟢 低

#### 21. `app/api/devices/route.ts`
**问题**：
- 使用 raw SQL 查询设备列表

**修复建议**：
```typescript
// ✅
const devices = await prisma.device_Inventory.findMany({
  where: { status: 'In_Stock' }
})
```

---

## ✅ 已修复的文件

### 1. `app/api/device/check/route.ts` ✅
**修复时间**：2026-02-03  
**修复内容**：
- ✅ 改用 Prisma ORM
- ✅ 修正字段名（Warehouse → location）
- ✅ 增强返回信息

### 2. `app/api/import/excel/route.ts` ✅
**修复时间**：2026-02-03  
**修复内容**：
- ✅ 改用 Prisma ORM
- ✅ 修正字段名
- ✅ UPSERT 逻辑优化

---

## 🎯 修复优先级建议

### 🔴 第一优先级（立即修复）- 核心业务流程

1. **认证模块**
   - `auth/login/route.ts`
   - `auth/register/route.ts`
   - `auth/me/route.ts`

2. **工单核心**
   - `tickets/create/route.ts`
   - `tickets/[id]/update/route.ts`
   - `tickets/[id]/route.ts`

**原因**：这些是系统最核心的功能，影响用户登录和工单创建

---

### 🟡 第二优先级（逐步修复）- 扩展功能

3. **用户管理**
   - `users/route.ts`
   - `users/[id]/route.ts`

4. **工单扩展**
   - `tickets/batch/route.ts`
   - `tickets/route.ts`（列表查询）

---

### 🟢 第三优先级（可延后）- 辅助功能

5. **统计报表**
   - `statistics/route.ts`
   - `tickets/export/route.ts`

6. **系统配置**
   - `system-config/route.ts`
   - `devices/route.ts`

---

## 🚨 常见问题

### Q1: 为什么禁止 raw SQL？
**A**：
- ❌ **类型不安全**：容易拼写错误，运行时才发现
- ❌ **字段名不一致**：Warehouse vs Location
- ❌ **维护困难**：SQL 分散在代码中
- ❌ **跨数据库差**：换数据库需要重写
- ✅ **Prisma 优势**：类型安全、自动补全、易维护

### Q2: 修复会很复杂吗？
**A**：大部分是简单替换，模式如下：

```typescript
// ❌ Raw SQL
const result = await pool.request()
  .input('id', id)
  .query(`SELECT * FROM Users WHERE UserID = @id`)
const user = result.recordset[0]

// ✅ Prisma
const user = await prisma.users.findUnique({
  where: { userID: id }
})
```

### Q3: 复杂查询怎么办？
**A**：Prisma 支持：
- ✅ 关联查询（include）
- ✅ 聚合函数（groupBy, count, sum）
- ✅ 事务（$transaction）
- ✅ 原始查询（$queryRaw，作为最后手段）

---

## 📝 修复进度追踪

- [ ] 认证模块（3 个文件）
- [ ] 用户管理（2 个文件）
- [ ] 工单核心（8 个文件）
- [ ] 工单扩展（8 个文件）
- [ ] 统计配置（2 个文件）
- [x] 设备检查（1 个文件）✅
- [x] Excel 导入（1 个文件）✅

**总进度**：2/23 (9%)

---

## 🔗 相关文档

- [Prisma ORM 文档](https://www.prisma.io/docs)
- [Prisma 迁移指南](https://www.prisma.io/docs/guides/migrate-to-prisma)
- 项目 `.cursorrules` 文件

---

**审计人员**：AI 架构师  
**下次审计**：修复完成后
