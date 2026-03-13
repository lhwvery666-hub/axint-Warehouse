# 编辑页面附加字段功能

## 📋 功能说明

在维修报告编辑页面（`/repairs/edit/[id]`）添加了四个附加字段，用于设置打印报告中显示的内容。

---

## ✅ 已添加的UI字段

### 1. 是否维修（Switch开关）
- **类型**：开关（Switch）
- **默认值**：是（true）
- **显示**：是/否
- **用途**：标记该工单是否需要维修

### 2. 返回方式（下拉选择）
- **类型**：下拉选择框（Select）
- **默认值**：邮寄
- **选项**：
  - 邮寄
  - 配套
  - 自取
  - 快递
- **用途**：设置设备返回客户的方式

### 3. 维修类型（单选按钮）
- **类型**：单选框（RadioGroup）
- **默认值**：代翻维修
- **选项**：
  - ☑ 代翻维修
  - ☐ 发票维修
  - ☐ 不维修
- **用途**：标记维修的计费类型

### 4. 外购产品（复选框）
- **类型**：复选框（Checkbox）
- **默认值**：否（false）
- **显示**：有外购产品 / 无外购产品
- **用途**：标记是否使用了外购产品

---

## 🎨 UI展示

```
┌─────────────────────────────────────────────┐
│ 报告附加信息                                │
├─────────────────────────────────────────────┤
│                                             │
│ 是否维修：     [开关] 是                    │
│                                             │
│ 返回方式：     [邮寄 ▼]                     │
│                                             │
│ 维修类型：     ○ 代翻维修                   │
│                ○ 发票维修                   │
│                ○ 不维修                     │
│                                             │
│ 外购产品：     □ 无外购产品                 │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📂 修改的文件

### 1. 前端组件
✅ `app/repairs/edit/[id]/page.tsx`
- 添加4个状态变量
- 导入Select、RadioGroup、Checkbox组件
- 在备注区域下方添加"报告附加信息"Card
- 添加4个输入控件

---

## ⚠️ 待完成的工作

### 第1步：添加数据库字段

需要创建数据库迁移脚本来添加这些字段：

```sql
-- scripts/add-report-additional-fields.ts

ALTER TABLE Repair_Tickets 
ADD IsRepairNeeded BIT DEFAULT 1;

ALTER TABLE Repair_Tickets 
ADD ReturnMethod NVARCHAR(50) DEFAULT '邮寄';

ALTER TABLE Repair_Tickets 
ADD RepairType NVARCHAR(50) DEFAULT '代翻维修';

ALTER TABLE Repair_Tickets 
ADD HasExternalProducts BIT DEFAULT 0;
```

**执行命令**：
```bash
npx tsx scripts/add-report-additional-fields.ts
```

---

### 第2步：定义枚举（lib/enums.ts）

根据cursorrules规则，不能使用硬编码字符串，需要定义枚举：

```typescript
// lib/enums.ts

export enum ReturnMethod {
  EXPRESS = '邮寄',
  PACKAGE = '配套',
  PICKUP = '自取',
  COURIER = '快递',
}

export enum RepairType {
  PROXY = '代翻维修',
  INVOICE = '发票维修',
  NO_REPAIR = '不维修',
}

// 数据库字段名常量
export const DB_FIELDS = {
  // ... 现有字段 ...
  IS_REPAIR_NEEDED: 'IsRepairNeeded',
  RETURN_METHOD: 'ReturnMethod',
  REPAIR_TYPE: 'RepairType',
  HAS_EXTERNAL_PRODUCTS: 'HasExternalProducts',
};
```

---

### 第3步：更新保存API

#### 批次报告API（`app/api/tickets/batch-repair-report/[batchId]/route.ts`）

**PUT方法修改**：
```typescript
// 接收新字段
const { 
  devices, 
  remarks,
  isRepairNeeded,
  returnMethod,
  repairType,
  hasExternalProducts 
} = await req.json();

// 更新数据库
await pool.request()
  .input('batchId', sql.NVarChar, batchId)
  .input('repairReport', sql.NVarChar, JSON.stringify(reportContent))
  .input('isRepairNeeded', sql.Bit, isRepairNeeded)
  .input('returnMethod', sql.NVarChar, returnMethod)
  .input('repairType', sql.NVarChar, repairType)
  .input('hasExternalProducts', sql.Bit, hasExternalProducts)
  .query(`
    UPDATE Repair_Tickets
    SET 
      RepairReportContent = @repairReport,
      IsRepairNeeded = @isRepairNeeded,
      ReturnMethod = @returnMethod,
      RepairType = @repairType,
      HasExternalProducts = @hasExternalProducts
    WHERE BatchId = @batchId
  `);
```

**GET方法修改**：
```typescript
// 查询时包含新字段
const query = `
  SELECT 
    ...,
    ${DB_FIELDS.IS_REPAIR_NEEDED},
    ${DB_FIELDS.RETURN_METHOD},
    ${DB_FIELDS.REPAIR_TYPE},
    ${DB_FIELDS.HAS_EXTERNAL_PRODUCTS}
  FROM Repair_Tickets
  WHERE BatchId = @batchId
`;

// 返回数据时包含新字段
const batchInfo = {
  ...,
  isRepairNeeded: firstTicket[DB_FIELDS.IS_REPAIR_NEEDED],
  returnMethod: firstTicket[DB_FIELDS.RETURN_METHOD],
  repairType: firstTicket[DB_FIELDS.REPAIR_TYPE],
  hasExternalProducts: firstTicket[DB_FIELDS.HAS_EXTERNAL_PRODUCTS],
};
```

---

### 第4步：更新编辑页面保存逻辑

#### `app/repairs/edit/[id]/page.tsx`

**修改保存函数**：
```typescript
const handleSave = async () => {
  setSaving(true);
  try {
    if (isBatchMode) {
      const response = await fetch(`/api/tickets/batch-repair-report/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          devices,
          remarks,
          isRepairNeeded,        // 新增
          returnMethod,          // 新增
          repairType,            // 新增
          hasExternalProducts,   // 新增
        }),
      });
      // ...
    }
  } catch (error) {
    // ...
  } finally {
    setSaving(false);
  }
};
```

**修改数据加载**：
```typescript
useEffect(() => {
  const fetchData = async () => {
    // ...
    if (result.success && result.data) {
      setBatchInfo(result.data.batchInfo);
      setDevices(result.data.devices);
      setRemarks(result.data.remarks || '');
      
      // 加载新字段
      setIsRepairNeeded(result.data.batchInfo.isRepairNeeded ?? true);
      setReturnMethod(result.data.batchInfo.returnMethod || '邮寄');
      setRepairType(result.data.batchInfo.repairType || '代翻维修');
      setHasExternalProducts(result.data.batchInfo.hasExternalProducts || false);
    }
  };
  fetchData();
}, [params.id]);
```

---

### 第5步：更新打印页面显示

#### `app/repairs/print/[id]/page.tsx`

**修改数据类型定义**：
```typescript
interface BatchReportData {
  batchInfo: {
    // ... 现有字段 ...
    isRepairNeeded?: boolean;
    returnMethod?: string;
    repairType?: string;
    hasExternalProducts?: boolean;
  };
  // ...
}
```

**修改显示内容**（替换硬编码）：
```tsx
{/* 是否维修 - 显示实际值 */}
<div className="warranty-section">
  <div className="warranty-label">
    是否维修：{reportData?.batchInfo?.isRepairNeeded ? '是' : '否'}
  </div>
</div>

{/* 返回方式 - 显示实际值 */}
<div className="return-method-section">
  <strong>返回方式：</strong>
  <span style={{ marginLeft: '8px' }}>
    {reportData?.batchInfo?.returnMethod || '邮寄'}
  </span>
</div>

{/* 维修类型 - 显示实际选中的选项 */}
<div className="bottom-signature-section">
  <div className="bottom-signature-left-align">
    <span style={{ marginRight: '15px' }}>
      {reportData?.batchInfo?.repairType === '代翻维修' ? '☑' : '☐'} 代翻维修
    </span>
    <span style={{ marginRight: '15px' }}>
      {reportData?.batchInfo?.repairType === '发票维修' ? '☑' : '☐'} 发票维修
    </span>
    <span style={{ marginRight: '15px' }}>
      {reportData?.batchInfo?.repairType === '不维修' ? '☑' : '☐'} 不维修
    </span>
    <span style={{ marginLeft: '60px', marginRight: '15px' }}>
      <strong>制单人：</strong>
      {user?.realName || user?.username || '-'}
    </span>
    <span style={{ marginLeft: '15px' }}>
      {reportData?.batchInfo?.hasExternalProducts ? '☑' : '☐'} 外购产品
    </span>
  </div>
</div>
```

---

## 🧪 当前测试步骤

### 测试1：UI显示

1. [ ] 打开编辑页面：`localhost:3000/repairs/edit/WO2602249788`
2. [ ] 滚动到底部
3. [ ] **验证**：看到"报告附加信息"卡片
4. [ ] **验证**：看到"是否维修"开关
5. [ ] **验证**：看到"返回方式"下拉框
6. [ ] **验证**：看到"维修类型"单选按钮
7. [ ] **验证**：看到"外购产品"复选框

---

### 测试2：交互功能

1. [ ] 切换"是否维修"开关
2. [ ] **验证**：显示文本变为"是"或"否"
3. [ ] 选择不同的"返回方式"
4. [ ] **验证**：下拉框值改变
5. [ ] 选择不同的"维修类型"
6. [ ] **验证**：单选按钮切换正常
7. [ ] 勾选/取消"外购产品"
8. [ ] **验证**：显示文本变为"有外购产品"或"无外购产品"

---

### 测试3：保存功能（待数据库字段添加后）

⚠️ **当前状态**：UI已完成，但数据不会保存到数据库，因为：
- 数据库表中还没有这些字段
- API还没有更新来处理这些字段

**完成数据库和API更新后**：
1. [ ] 设置所有字段的值
2. [ ] 点击"保存并继续"
3. [ ] **验证**：跳转到打印页面
4. [ ] **验证**：打印页面显示刚才设置的值（不是硬编码的值）
5. [ ] 返回编辑页面
6. [ ] **验证**：字段值保持之前设置的值（从数据库读取）

---

## 📋 实现进度

### ✅ 已完成
- [x] UI设计和布局
- [x] 添加4个状态变量
- [x] 导入必要的组件
- [x] 创建"报告附加信息"卡片
- [x] 添加"是否维修"开关
- [x] 添加"返回方式"下拉框
- [x] 添加"维修类型"单选按钮
- [x] 添加"外购产品"复选框
- [x] UI交互功能（组件状态管理）

### ⏳ 待完成（需要数据库支持）
- [ ] 创建数据库迁移脚本
- [ ] 定义枚举（lib/enums.ts）
- [ ] 更新batch-repair-report API（GET和PUT）
- [ ] 更新编辑页面保存逻辑
- [ ] 更新编辑页面加载逻辑
- [ ] 更新打印页面类型定义
- [ ] 更新打印页面显示逻辑（使用实际值而非硬编码）

---

## 🎯 下一步行动

### 立即可做
1. **测试UI**：刷新编辑页面，查看新添加的字段
2. **测试交互**：尝试修改各个字段的值

### 需要代码更新
如果需要这些字段真正保存到数据库并在打印页面显示，需要：
1. 运行数据库迁移脚本（添加字段）
2. 更新API代码（batch-repair-report）
3. 更新编辑页面保存/加载逻辑
4. 更新打印页面显示逻辑

---

## 💡 设计说明

### 为什么这样设计？

1. **是否维修（Switch）**
   - 简单的是/否选择，Switch最直观
   - 默认为"是"，符合常规流程

2. **返回方式（Select）**
   - 有多个预定义选项，下拉框最合适
   - 可扩展，未来可添加更多选项

3. **维修类型（RadioGroup）**
   - 单选选项，RadioGroup符合用户习惯
   - 与打印报告中的复选框样式对应

4. **外购产品（Checkbox）**
   - 简单的是/否选择
   - 用Checkbox而不是Switch，与打印报告中的"☐"样式对应

---

## 📱 响应式设计

所有字段在不同屏幕尺寸下都能正常显示：
- **桌面端**：所有字段横向排列，标签宽度统一（w-32）
- **移动端**：自动适配，字段可能会垂直堆叠
- **标签对齐**：所有标签右对齐，宽度统一，视觉效果整洁

---

**功能添加日期**：2026-02-24  
**开发者**：AI Assistant（架构师）  
**状态**：✅ UI已完成，⏳ 待数据库和API支持
