# Excel 上传功能修复文档

## 📋 问题诊断

### 上传失败的根本原因

#### 1. 违反 `.cursorrules`：使用 Raw SQL
**问题**：`app/api/import/excel/route.ts` 中大量使用 `mssql` raw SQL 查询

**原代码**：
```typescript
// ❌ 错误：使用 raw SQL
const pool = await getDbConnection();
const result = await pool.request().query(`
  SELECT ModelName FROM Product_Catalog WHERE ModelName IS NOT NULL
`);
```

**修复后**：
```typescript
// ✅ 正确：使用 Prisma ORM
const existingProducts = await prisma.product_Catalog.findMany({
  select: { modelName: true }
});
```

---

#### 2. 字段名不匹配
**问题**：代码中使用 `Warehouse` 字段，但数据库实际是 `Location`

**原代码**：
```typescript
// ❌ 错误字段名
interface DeviceRecord {
  Warehouse: string; // 数据库中不存在此字段
}
```

**修复后**：
```typescript
// ✅ 正确字段名
interface DeviceRecord {
  location: string; // 对应数据库 Location 字段
}
```

---

#### 3. Product_Catalog 缺少必填字段
**问题**：插入 `Product_Catalog` 时只提供了 `ModelName`，缺少必填字段 `category`

**原代码**：
```typescript
// ❌ 缺少必填字段
INSERT INTO Product_Catalog (ModelName, DisplayOrder)
VALUES (@ModelName, @DisplayOrder)
```

**修复后**：
```typescript
// ✅ 提供完整字段
await prisma.product_Catalog.create({
  data: {
    category: '未分类',
    subCategory: '未分类',
    modelName: model,
    modelCode: `AUTO-${Date.now()}-${i}`,
    manufacturer: '爱克信',
    defaultWarrantyMonths: 12,
    isActive: true
  }
});
```

---

## 🔧 修复内容总结

### 修改的文件
- `app/api/import/excel/route.ts` - 完全重构，改用 Prisma ORM

### 主要变更

#### 1. 移除 Raw SQL
✅ 删除 `mssql` 依赖  
✅ 删除 `getDbConnection` 调用  
✅ 使用 `prisma` 客户端替代所有 SQL 查询

#### 2. 修正字段名
✅ `Warehouse` → `location`  
✅ `MaterialCode` → `materialCode`  
✅ `SerialNumber` → `serialNumber`  
✅ `DeviceName` → `deviceName`  
✅ `ModelName` → `modelName`  
✅ `Status` → `status`

#### 3. 完善 Product_Catalog 插入逻辑
✅ 添加 `category` 字段（默认：未分类）  
✅ 添加 `subCategory` 字段（默认：未分类）  
✅ 添加 `modelCode` 字段（自动生成唯一值）  
✅ 添加 `manufacturer` 字段（默认：爱克信）  
✅ 添加 `defaultWarrantyMonths` 字段（默认：12）  
✅ 添加 `isActive` 字段（默认：true）

#### 4. 改进错误处理
✅ 使用 Prisma 的 upsert 方法（自动处理插入/更新）  
✅ 捕获重复键错误（P2002），继续处理其他记录  
✅ 添加 `finally` 块，确保数据库连接正确关闭

---

## 📊 数据流程

### Excel 文件结构（import_data.xlsx）

| 列 | 索引 | 字段名 | 数据库字段 | 说明 |
|----|------|--------|-----------|------|
| A  | 0    | 物料代码 | materialCode | 可选 |
| B  | 1    | 序列号 | serialNumber | **必填** |
| C  | 2    | 物料名称 | deviceName | 可选 |
| D  | 3    | 规格型号 | modelName | 可选 |
| I  | 8    | 仓库名称 | location | 可选 |
| M  | 12   | 序列号状态 | status | 可选 |

### 导入流程

```
1. 前端上传 Excel 文件
   ↓
2. API 接收 FormData
   ↓
3. XLSX 解析文件内容
   ↓
4. 验证并转换数据（跳过标题行）
   ↓
5. 提取不重复的规格型号
   ↓
6. 【Prisma】维护 Product_Catalog（自动插入新型号）
   ↓
7. 【Prisma】批量 UPSERT Device_Inventory（更新或插入设备记录）
   ↓
8. 返回统计结果
```

---

## 🎯 测试步骤

### 1. 准备测试数据
确保 `import_data.xlsx` 文件在项目根目录，且包含：
- 第 1 行：标题行（会被跳过）
- 第 2+ 行：数据行，至少包含序列号（B列）

### 2. 启动开发服务器
```bash
npm run dev
```

### 3. 登录管理员账号
- 用户名：`admin`
- 密码：`111111`

### 4. 进入数据库管理页面
导航到：`/admin/database`

### 5. 上传 Excel 文件
- 点击"导入 Excel"按钮
- 选择 `import_data.xlsx`
- 等待上传完成

### 6. 验证结果
检查返回的统计信息：
```json
{
  "success": true,
  "message": "Excel 导入成功",
  "stats": {
    "totalRows": 32540,
    "validRecords": 32539,
    "skippedRows": 0,
    "modelsAdded": 38,
    "modelsSkipped": 0,
    "devicesProcessed": 32539
  }
}
```

---

## 🐛 故障排查

### 问题 1：上传后无反应
**原因**：开发服务器未启动  
**解决**：运行 `npm run dev`

### 问题 2：返回 "未找到上传的文件"
**原因**：FormData 字段名不匹配  
**解决**：确认前端使用 `formData.append('file', file)`

### 问题 3：返回 "Prisma 连接错误"
**原因**：数据库未运行或配置错误  
**解决**：
1. 检查 `.env` 文件中的 `DATABASE_URL`
2. 运行 `npx prisma generate`
3. 重启开发服务器

### 问题 4：部分记录插入失败
**原因**：数据格式问题或字段长度超限  
**解决**：
1. 检查 Excel 文件格式（必须是 .xlsx 或 .xls）
2. 检查序列号是否为空
3. 检查数据库字段长度限制

---

## 📝 后续优化建议

### 1. 性能优化
- [ ] 使用 Prisma 的批量事务（`prisma.$transaction`）
- [ ] 限制单次上传文件大小（建议 10MB）
- [ ] 添加上传进度条

### 2. 用户体验
- [ ] 显示详细的导入日志（哪些行成功/失败）
- [ ] 支持导入前预览数据
- [ ] 支持导出失败记录为 Excel

### 3. 数据验证
- [ ] 验证型号格式（正则表达式）
- [ ] 验证序列号唯一性（提前检查）
- [ ] 支持自定义列映射

### 4. 安全性
- [ ] 添加文件大小限制（防止内存溢出）
- [ ] 添加文件类型白名单验证
- [ ] 添加用户权限检查（只允许 Admin 上传）

---

## ✅ 符合规范确认

- [x] 使用 Prisma ORM（不使用 raw SQL）
- [x] 使用 TypeScript 类型安全
- [x] 字段名使用驼峰式（camelCase）
- [x] 错误处理完善
- [x] 数据库字段与 schema.prisma 一致

---

## 📚 相关文档

- [Prisma ORM 文档](https://www.prisma.io/docs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [XLSX 库文档](https://docs.sheetjs.com/)
- `.cursorrules` - 项目编码规范

---

**修复日期**：2026-02-03  
**修复人员**：AI 架构师  
**版本**：v1.0
