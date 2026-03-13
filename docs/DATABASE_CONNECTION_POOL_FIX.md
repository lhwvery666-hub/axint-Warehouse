# 数据库连接池修复说明

## 🐛 问题

**症状**：仓库管理员点击"确认批次设备"按钮没有反应

**错误**：
```
[Warehouse Confirm Batch] 确认批次设备失败: Error [ConnectionError]: Connection is closed.
code: 'ECONNCLOSED'
```

---

## 🔍 根本原因

在 `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts` 的 **finally 块中错误地关闭了数据库连接池**：

```typescript
// ❌ 错误的代码
finally {
  if (pool) {
    await pool.close();  // 这会关闭整个连接池！
  }
}
```

---

## ⚠️ 为什么会出错？

### `getDbConnection()` 的工作原理

```typescript
// lib/db-config.ts
let pool: sql.ConnectionPool | null = null;  // 单例模式

export async function getDbConnection(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await (sql as any).connect(dbConfig);  // 只创建一次
  }
  return pool;  // 返回共享的连接池
}
```

**关键点**：
1. ✅ 连接池是**单例模式**，全局只有一个实例
2. ✅ 所有 API 调用都**共享**这个连接池
3. ✅ 连接池会**自动管理**连接的生命周期
4. ❌ **不应该手动关闭**连接池

### 错误调用 `pool.close()` 的后果

```
第一次请求：
  ├─ getDbConnection() → 返回 pool (正常)
  ├─ 执行数据库操作 (成功)
  └─ finally 块：pool.close() ❌ 关闭了连接池！

第二次请求：
  ├─ getDbConnection() → 返回 pool (但已被关闭！)
  ├─ 尝试执行数据库操作
  └─ 报错：Connection is closed ❌
```

---

## ✅ 解决方案

### 修复前

```typescript
export async function POST(...) {
  let pool: any = null;
  let transaction: any = null;

  try {
    pool = await getDbConnection();
    transaction = pool.transaction();
    // ... 数据库操作
  } catch (error) {
    // ... 错误处理
  } finally {
    // ❌ 错误：关闭了共享的连接池
    if (pool) {
      await pool.close();
    }
  }
}
```

### 修复后

```typescript
export async function POST(...) {
  let pool: any = null;
  let transaction: any = null;

  try {
    pool = await getDbConnection();
    transaction = pool.transaction();
    // ... 数据库操作
  } catch (error) {
    // ... 错误处理
  }
  // ✅ 不关闭连接池！让连接池管理器自动处理
}
```

---

## 📋 正确的数据库连接使用模式

### ✅ 正确示例

```typescript
export async function GET/POST/PUT/DELETE(...) {
  try {
    const pool = await getDbConnection();  // 获取共享连接池
    
    // 使用连接池执行查询
    const result = await pool.request()
      .input('param', value)
      .query('SELECT ...');
    
    return NextResponse.json({ success: true, data: result.recordset });
    
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  // ✅ 不需要 finally 块，不需要关闭连接池
}
```

### ✅ 使用事务的正确示例

```typescript
export async function POST(...) {
  let transaction: any = null;
  
  try {
    const pool = await getDbConnection();
    transaction = pool.transaction();
    await transaction.begin();
    
    // ... 事务操作
    
    await transaction.commit();
    return NextResponse.json({ success: true });
    
  } catch (error) {
    if (transaction) {
      await transaction.rollback();  // 失败时回滚
    }
    return NextResponse.json({ success: false }, { status: 500 });
  }
  // ✅ 不关闭连接池
}
```

### ❌ 错误示例

```typescript
// ❌ 错误 1：手动关闭连接池
finally {
  if (pool) {
    await pool.close();  // 不要这样做！
  }
}

// ❌ 错误 2：每次都创建新连接
const pool = await sql.connect(dbConfig);  // 不要这样做！应该用 getDbConnection()
```

---

## 🎯 最佳实践

### 1. 总是使用 `getDbConnection()`

```typescript
// ✅ 正确
const pool = await getDbConnection();

// ❌ 错误
const pool = await sql.connect(dbConfig);
```

### 2. 不要手动关闭连接池

```typescript
// ✅ 正确：让连接池自动管理
export async function handler() {
  const pool = await getDbConnection();
  // ... 使用 pool
  // 函数结束，不需要关闭
}

// ❌ 错误：手动关闭会影响其他请求
finally {
  await pool.close();
}
```

### 3. 事务要正确 commit/rollback

```typescript
// ✅ 正确
let transaction = null;
try {
  transaction = pool.transaction();
  await transaction.begin();
  // ... 操作
  await transaction.commit();
} catch (error) {
  if (transaction) {
    await transaction.rollback();  // 重要！失败时回滚
  }
}
```

### 4. 只在应用关闭时关闭连接池

```typescript
// lib/db-config.ts 提供了专门的函数
export async function closeDbConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

// 只在应用关闭时调用（如进程退出）
process.on('SIGTERM', async () => {
  await closeDbConnection();
});
```

---

## 📊 修复结果

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| **第一次请求** | ✅ 成功 | ✅ 成功 |
| **第二次请求** | ❌ 连接关闭错误 | ✅ 成功 |
| **连接池状态** | ❌ 被关闭 | ✅ 保持活跃 |
| **其他 API** | ❌ 全部失败 | ✅ 正常工作 |

---

## 🔗 相关文件

- `lib/db-config.ts` - 数据库连接池配置
- `lib/work-order-number.ts` - 正确使用示例（参考第 66-70 行）
- `lib/config.ts` - 正确使用示例
- `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts` - 本次修复的文件

---

## 💡 关键教训

1. **理解单例模式**：共享资源不应该被单个请求关闭
2. **阅读文档**：查看 `lib/db-config.ts` 的注释和其他文件的使用方式
3. **参考现有代码**：其他 API 都没有关闭连接池
4. **测试完整流程**：不仅测试第一次请求，还要测试后续请求

---

**修复日期**：2026-02-26  
**问题影响**：严重（导致所有 API 在一次调用后失败）  
**修复状态**：✅ 已完成
