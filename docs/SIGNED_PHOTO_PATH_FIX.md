# 签字凭证图片路径修复

## 问题描述

用户从批次详情页可以看到"现场人员已上传签字凭证"的提示，但是图片本身无法加载显示。

### 问题现象

```
✅ 显示绿色提示："现场人员已上传签字凭证"
❌ 图片区域显示占位符，无法加载图片
```

## 问题根源

### 路径存储问题

在 `app/api/tickets/reporter-confirm/[batchId]/route.ts` 中，上传签字照片时，保存的路径格式为：

```typescript
// ❌ 错误：缺少前导 /
signedPhotoPath = `uploads/signed-reports/${fileName}`
```

但是在浏览器中访问 Next.js public 目录下的静态文件时，路径必须以 `/` 开头：

```typescript
// ✅ 正确：以 / 开头
signedPhotoPath = `/uploads/signed-reports/${fileName}`
```

### 文件结构

```
项目根目录/
├── public/
│   └── uploads/
│       └── signed-reports/
│           ├── WO2602249788-1234567890-abc123.jpg
│           └── ...
└── app/
```

浏览器访问路径：
- ❌ 错误：`uploads/signed-reports/xxx.jpg` （相对路径，找不到）
- ✅ 正确：`/uploads/signed-reports/xxx.jpg` （绝对路径，映射到 public/uploads/...）

## 解决方案

### 1. 修复新上传的图片路径

**文件**: `app/api/tickets/reporter-confirm/[batchId]/route.ts`

```typescript
// 修改前
signedPhotoPath = `uploads/signed-reports/${fileName}`

// 修改后
signedPhotoPath = `/uploads/signed-reports/${fileName}`
```

### 2. 兼容已上传的旧数据

由于数据库中可能已经存在没有 `/` 前缀的旧路径，我们需要在 API 读取时自动添加前缀。

**文件**: `app/api/tickets/batch-devices/[batchId]/route.ts`

```typescript
// 获取签字照片路径
let signedPhotoValue = result.recordset[0][DB_FIELDS.SIGNED_REPORT_PHOTO] || 
                       result.recordset[0].SignedReportPhoto || null;

// 确保路径以 / 开头（兼容旧数据）
if (signedPhotoValue && 
    !signedPhotoValue.startsWith('/') && 
    !signedPhotoValue.startsWith('http')) {
  signedPhotoValue = '/' + signedPhotoValue;
}

const batchInfo = {
  // ...
  signedReportPhoto: signedPhotoValue,
}
```

**文件**: `app/api/tickets/batch-repair-report/[batchId]/route.ts`

```typescript
// 获取签字照片路径并确保以 / 开头（兼容旧数据）
let signedPhotoPath = firstRecord[DB_FIELDS.SIGNED_REPORT_PHOTO] || 
                      firstRecord.SignedReportPhoto || null;

if (signedPhotoPath && 
    !signedPhotoPath.startsWith('/') && 
    !signedPhotoPath.startsWith('http')) {
  signedPhotoPath = '/' + signedPhotoPath;
}

const batchInfo = {
  // ...
  signedReportPhoto: signedPhotoPath,
}
```

### 3. 添加调试信息（临时）

**文件**: `components/batch-work-order-detail.tsx`

```typescript
<div className="border rounded-lg p-4 bg-white">
  {/* 临时调试信息 */}
  <p className="text-xs text-gray-500 mb-2">
    图片路径: {batchInfo.signedReportPhoto}
  </p>
  
  <img 
    src={batchInfo.signedReportPhoto} 
    alt="签字凭证" 
    className="w-full max-w-md mx-auto rounded-lg shadow-sm"
    onError={(e) => {
      console.error('图片加载失败:', batchInfo.signedReportPhoto);
      // ... 错误处理
    }}
    onLoad={() => {
      console.log('图片加载成功:', batchInfo.signedReportPhoto);
    }}
  />
</div>
```

## 修复效果

### 修复前 ❌

```
数据库存储: "uploads/signed-reports/xxx.jpg"
    ↓
API 返回: "uploads/signed-reports/xxx.jpg"
    ↓
浏览器访问: localhost:3000/uploads/signed-reports/xxx.jpg
    ↓
❌ 404 Not Found（相对路径，找不到文件）
```

### 修复后 ✅

```
数据库存储: "/uploads/signed-reports/xxx.jpg" (新数据)
           或 "uploads/signed-reports/xxx.jpg" (旧数据)
    ↓
API 自动修正: "/uploads/signed-reports/xxx.jpg"
    ↓
浏览器访问: localhost:3000/uploads/signed-reports/xxx.jpg
    ↓
✅ 成功访问 public/uploads/signed-reports/xxx.jpg
```

## 涉及的文件

| 文件 | 修改内容 | 作用 |
|-----|---------|------|
| `app/api/tickets/reporter-confirm/[batchId]/route.ts` | 上传时路径加 `/` 前缀 | 修复新上传图片 |
| `app/api/tickets/batch-devices/[batchId]/route.ts` | 读取时自动添加 `/` | 兼容旧数据 |
| `app/api/tickets/batch-repair-report/[batchId]/route.ts` | 读取时自动添加 `/` | 兼容旧数据 |
| `components/batch-work-order-detail.tsx` | 添加调试日志 | 排查问题 |

## 测试验证

### 新上传的图片

1. ✅ 现场人员上传签字照片
2. ✅ 数据库存储路径为 `/uploads/signed-reports/xxx.jpg`
3. ✅ 批次详情页图片正确显示
4. ✅ 打印页面图片正确显示

### 已存在的旧数据

1. ✅ 数据库中旧路径 `uploads/signed-reports/xxx.jpg`
2. ✅ API 自动添加 `/` 前缀
3. ✅ 批次详情页图片正确显示
4. ✅ 打印页面图片正确显示

### 图片操作

1. ✅ 点击"查看大图"打开新窗口显示
2. ✅ 点击"下载照片"下载到本地
3. ✅ 点击"复制链接"复制完整URL
4. ✅ 图片加载失败时显示错误提示

## 注意事项

### 1. 路径格式标准

所有文件路径统一使用以下格式：

```typescript
// ✅ 正确格式
"/uploads/signed-reports/filename.jpg"  // 以 / 开头
"http://example.com/image.jpg"          // 或完整URL

// ❌ 错误格式
"uploads/signed-reports/filename.jpg"   // 缺少前导 /
"./uploads/filename.jpg"                // 不要使用 ./
"../public/uploads/filename.jpg"        // 不要使用 ../
```

### 2. public 目录映射

Next.js 会自动将 `public` 目录映射到网站根路径：

```
public/uploads/image.jpg  →  /uploads/image.jpg
public/favicon.ico        →  /favicon.ico
```

### 3. 兼容性处理

API 的路径修正逻辑会：
- ✅ 保留已经有 `/` 前缀的路径
- ✅ 保留 HTTP/HTTPS 完整 URL
- ✅ 只为相对路径添加 `/` 前缀

```typescript
if (path && !path.startsWith('/') && !path.startsWith('http')) {
  path = '/' + path;
}
```

### 4. 后续优化建议

#### 选项A: 数据库迁移脚本

为已存在的旧数据统一添加 `/` 前缀：

```typescript
// scripts/fix-signed-photo-paths.ts
import { getDbConnection } from "@/lib/db-config";
import { DB_FIELDS } from "@/lib/enums";

async function fixPaths() {
  const pool = await getDbConnection();
  
  // 查询所有需要修复的记录
  const result = await pool.query(`
    SELECT ID, ${DB_FIELDS.SIGNED_REPORT_PHOTO}
    FROM Repair_Tickets
    WHERE ${DB_FIELDS.SIGNED_REPORT_PHOTO} IS NOT NULL
      AND ${DB_FIELDS.SIGNED_REPORT_PHOTO} NOT LIKE '/%'
      AND ${DB_FIELDS.SIGNED_REPORT_PHOTO} NOT LIKE 'http%'
  `);
  
  console.log(`找到 ${result.recordset.length} 条需要修复的记录`);
  
  // 逐条更新
  for (const record of result.recordset) {
    const oldPath = record[DB_FIELDS.SIGNED_REPORT_PHOTO];
    const newPath = '/' + oldPath;
    
    await pool.request()
      .input('id', record.ID)
      .input('newPath', newPath)
      .query(`
        UPDATE Repair_Tickets
        SET ${DB_FIELDS.SIGNED_REPORT_PHOTO} = @newPath
        WHERE ID = @id
      `);
    
    console.log(`✅ 更新: ${oldPath} → ${newPath}`);
  }
  
  console.log('✅ 所有路径已修复');
}

fixPaths();
```

运行方式：
```bash
npx tsx scripts/fix-signed-photo-paths.ts
```

#### 选项B: 保持当前兼容方案

优点：
- 不需要修改数据库
- 代码自动处理新旧数据
- 零停机时间

缺点：
- 每次查询都需要路径检查
- 代码稍微复杂一点

**推荐**: 保持当前兼容方案，性能影响微乎其微。

## 相关文档

- [BATCH_NAVIGATION_FIX.md](./BATCH_NAVIGATION_FIX.md) - 批次工单导航修复
- [SIGNED_PHOTO_LOCK_MECHANISM.md](./SIGNED_PHOTO_LOCK_MECHANISM.md) - 签字照片锁定机制

---

**修复时间**: 2026-02-25  
**版本**: v1.2.2  
**状态**: ✅ 已完成
