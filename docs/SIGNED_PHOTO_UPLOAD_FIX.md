# 签字照片上传功能修复

## 🐛 问题描述

用户在现场人员页面（`/repairs/print/[batchId]`）上传签字凭证时遇到错误：

```
Console Error: 设备数据缺失
Call Stack: handlePhotoUpload
```

## 🔍 问题原因

### 根本原因

API 端点 `/api/tickets/reporter-confirm/[batchId]` 原本设计为处理以下数据：
1. **设备确认数据** (`devices`): 包含 `willReturn`（是否回寄）和 `isCompleted`（是否完成维修）
2. **签字照片** (`signedPhoto`): 客户签字的报告照片

原代码强制要求 `devices` 参数必须存在：

```typescript
const devicesJson = formData.get('devices') as string

if (!devicesJson) {
  return NextResponse.json(
    { success: false, message: "设备数据缺失" },
    { status: 400 }
  )
}
```

### 变更导致的问题

在之前的优化中，我们移除了打印页面的"维修确认"部分（设备级别的 `willReturn` 和 `isCompleted` 开关），因为这些确认已经不再在打印页面进行。但是：

1. **前端** (`handlePhotoUpload`): 现在只发送 `signedPhoto`，不再发送 `devices` 数据
2. **后端** (API): 仍然强制要求 `devices` 参数
3. **结果**: API 报错 "设备数据缺失"

## ✅ 解决方案

### 修改 API 逻辑

将 `devices` 参数改为**可选的**，支持三种情况：

#### 情况1: 只上传签字照片（最常见）

```typescript
// FormData 只包含 signedPhoto
if (signedPhotoPath && devices.length === 0) {
  // 更新批次下所有设备的签字照片字段
  await pool.request()
    .input("batchId", batchId)
    .input("signedPhoto", signedPhotoPath)
    .query(`
      UPDATE Repair_Tickets
      SET SignedReportPhoto = @signedPhoto
      WHERE BatchId = @batchId
    `)
  
  return { success: true, message: "签字照片已上传" }
}
```

#### 情况2: 同时上传签字照片和设备确认数据（向后兼容）

```typescript
// FormData 包含 signedPhoto 和 devices
if (devices.length > 0) {
  // 逐个更新设备的确认信息 + 签字照片
  for (const device of devices) {
    // 更新 RepairReportContent (willReturn, isCompleted)
    // 更新 SignedReportPhoto
  }
  
  // 检查是否全部完成，更新工单状态
  if (allCompleted) {
    // 更新状态为 admin_review
  }
  
  return { success: true, message: "..." }
}
```

#### 情况3: 既没有照片也没有设备数据（错误）

```typescript
return { 
  success: false, 
  message: "没有需要更新的数据" 
}
```

## 📝 修改详情

### 文件: `app/api/tickets/reporter-confirm/[batchId]/route.ts`

#### 修改1: 使 devices 参数可选

**修改前:**
```typescript
const devicesJson = formData.get('devices') as string

if (!devicesJson) {
  return NextResponse.json(
    { success: false, message: "设备数据缺失" },
    { status: 400 }
  )
}

const devices = JSON.parse(devicesJson)
```

**修改后:**
```typescript
let devices: any[] = []
if (devicesJson) {
  try {
    devices = JSON.parse(devicesJson)
    if (!Array.isArray(devices)) {
      return NextResponse.json(
        { success: false, message: "设备数据格式不正确" },
        { status: 400 }
      )
    }
  } catch (e) {
    return NextResponse.json(
      { success: false, message: "设备数据解析失败" },
      { status: 400 }
    )
  }
}
```

#### 修改2: 添加只上传照片的处理逻辑

```typescript
// 如果只上传签字照片（没有设备确认数据）
if (signedPhotoPath && devices.length === 0) {
  console.log(`📸 仅上传签字照片，更新批次 ${batchId} 下所有设备`)
  
  await pool.request()
    .input("batchId", batchId)
    .input("signedPhoto", signedPhotoPath)
    .query(`
      UPDATE Repair_Tickets
      SET SignedReportPhoto = @signedPhoto
      WHERE BatchId = @batchId
    `)
  
  return NextResponse.json({
    success: true,
    message: "签字照片已上传",
  })
}
```

#### 修改3: 优化返回逻辑

将设备确认的返回逻辑整合到设备处理的 if 块中，避免重复代码。

## 🎯 使用场景

### 现场人员上传签字照片

1. 访问打印页面 `/repairs/print/WO2602249788`
2. 查看维修报告内容
3. 打印报告给客户签字
4. 拍照上传签字后的报告
5. 点击"上传照片"按钮
6. **✅ 成功**: 签字照片保存到批次下所有设备

### 维修人员确认完成（如果需要）

虽然现在打印页面不包含设备确认，但 API 仍然兼容旧的确认流程：

1. 传递 `devices` 数组（包含 `willReturn` 和 `isCompleted`）
2. API 更新每个设备的确认信息
3. 如果所有设备都完成，更新工单状态

## ✅ 测试要点

### 功能测试

1. **只上传签字照片**
   - ✅ 现场人员在打印页面上传照片
   - ✅ 照片成功保存
   - ✅ 批次下所有设备的 `SignedReportPhoto` 字段更新
   - ✅ 提示 "签字照片已上传"

2. **签字照片显示**
   - ✅ 批次工单详情页显示照片
   - ✅ 批次设备选择页显示照片
   - ✅ 打印页面顶部显示照片

3. **权限控制**
   - ✅ 只有现场人员（reporter）可以上传照片
   - ✅ 其他角色只能查看

### 错误处理

1. **无效文件类型**: 提示 "请上传图片文件"
2. **文件过大**: 提示 "图片大小不能超过 5MB"
3. **既没有照片也没有设备数据**: 提示 "没有需要更新的数据"

## 📊 影响范围

### 受影响的文件

- ✅ `app/api/tickets/reporter-confirm/[batchId]/route.ts` - API 逻辑修改
- ✅ `app/repairs/print/[id]/page.tsx` - 前端调用（无需修改）

### 向后兼容性

✅ **完全兼容**: API 仍然支持旧的确认流程（包含 `devices` 数据），因此不会影响现有功能。

## 🔗 相关功能

- `REMOVE_REPAIR_CONFIRMATION.md` - 移除维修确认功能的文档
- `SIGNED_PHOTO_LOCK_MECHANISM.md` - 签字照片锁定机制
- `CHARGEABLE_WORKFLOW.md` - 收费/非收费工作流

---

**修复时间**: 2026-02-24  
**版本**: v1.0.1  
**状态**: ✅ 已修复
