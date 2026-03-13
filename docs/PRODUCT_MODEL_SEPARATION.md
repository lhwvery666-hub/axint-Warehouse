# 产品型号分离说明

## 📋 背景

系统中存在**两种型号**，用途和受众不同：

### 1. **客户型号**（Product_Catalog）
- **用途**: 给客户看的、用于报告和打印
- **来源**: 三级下拉框选择
- **示例**: 
  - 五金工具 > 电动工具 > NC100-1M
  - 电气设备 > 开关设备 > AX-TRC2
- **特点**: 
  - 结构化（类别/子类/型号）
  - 客户友好的命名
  - 用于维修报告打印

### 2. **内部型号**（Device_Inventory）
- **用途**: 内部管理、仓库盘点
- **来源**: Excel导入（import_data.xlsx）
- **示例**: 
  - XX-2024-001
  - INTERNAL-MODEL-123
- **特点**: 
  - 内部编码规则
  - 包含位置、保修期等信息
  - 仅供内部人员查看

---

## 🐛 修复的Bug

### 问题描述
**错误行为**：
```
用户输入序列号 N77E1401
  ↓
系统从 Device_Inventory 查询到内部型号
  ↓
❌ 自动填充到三级下拉框
  ↓
❌ 客户看到了内部型号（不应该）
```

### 问题代码（已删除）
```typescript
// ❌ 错误：自动填充内部型号
if (deviceData.modelName) {
  const matchedModel = deviceModels.find(m => 
    m.name === deviceData.modelName
  )
  if (matchedModel) {
    updatedDevice.category = matchedModel.category
    updatedDevice.subCategory = matchedModel.subCategory
    updatedDevice.modelSelected = matchedModel.name
  }
}
```

**问题原因**：
- Device_Inventory.modelName 是**内部型号**
- Product_Catalog.modelName 是**客户型号**
- 两者命名规则不同，不应该自动匹配

---

## ✅ 修复方案

### 正确流程
```
用户输入序列号 N77E1401
  ↓
系统验证：Device_Inventory 中存在 ✅
  ↓
显示：设备验证成功
  ↓
内部型号仅对非reporter角色显示（权限控制）
  ↓
用户手动选择：五金工具 > 电动工具 > NC100-1M（客户型号）
```

### 修复后的代码
```typescript
// ✅ 正确：不自动填充型号
const deviceData = json.data as DeviceCheckResult

// 序列号验证通过，保存设备信息（仅用于显示和内部记录）
// 注意：不自动填充型号到三级下拉框
// 原因：Device_Inventory存储的是内部型号，Product_Catalog是客户型号，两者不同
const updatedDevice = { 
  ...device, 
  snValid: true, 
  snData: deviceData,  // 保存用于内部查看
  checkingSn: false 
  // 不修改 category/subCategory/modelSelected
}
```

---

## 🔐 权限控制

### 内部型号显示规则

```typescript
{/* 型号和名称只对内部人员显示（非现场报告人员） */}
{user?.role !== "reporter" && device.snData.modelName && (
  <p className="text-xs text-green-600 mt-1">
    型号: {device.snData.modelName}
    {device.snData.deviceName && ` (${device.snData.deviceName})`}
  </p>
)}
```

### 权限说明

| 角色 | 能否看到内部型号 | 说明 |
|------|----------------|------|
| reporter（现场人员） | ❌ 否 | 只看到"设备验证成功" |
| technician（维修人员） | ✅ 是 | 可以看到内部型号和位置 |
| admin（管理员） | ✅ 是 | 可以看到所有信息 |
| warehouse（仓库） | ✅ 是 | 可以看到内部型号和位置 |

---

## 📊 数据流转

### 创建工单时

```
┌─────────────────────────────────────┐
│ 1. 用户输入序列号                    │
│    N77E1401                          │
└──────────┬──────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│ 2. 系统验证（Device_Inventory）      │
│    - 存在：显示"设备验证成功"        │
│    - 不存在：显示错误提示            │
│    - 内部型号仅内部人员可见          │
└──────────┬──────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│ 3. 用户手动选择客户型号              │
│    五金工具 > 电动工具 > NC100-1M    │
│    （从Product_Catalog三级下拉框）   │
└──────────┬──────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│ 4. 保存到数据库                      │
│    - ProductSN: N77E1401            │
│    - ModelName: NC100-1M（客户型号） │
│    - Category: 五金工具              │
│    - SubCategory: 电动工具           │
└─────────────────────────────────────┘
```

### 维修报告打印时

```
使用 Product_Catalog 的客户型号
  ↓
报告中显示：五金工具-电动工具-NC100-1M
  ↓
✅ 客户看到友好的型号名称
```

### Excel导出时

```
使用 Repair_Tickets.ModelName（客户型号）
  ↓
导出Excel中显示：NC100-1M
  ↓
✅ 统一使用客户型号
```

---

## 🎯 设计原则

### 1. 职责分离
- **Device_Inventory**：内部管理、库存盘点
- **Product_Catalog**：客户沟通、报告打印

### 2. 用户体验
- 现场人员：不需要了解内部编码
- 维修人员：需要查看内部型号和库存位置
- 客户：只看到友好的产品名称

### 3. 数据安全
- 内部编码规则不暴露给客户
- 权限控制确保信息隔离

---

## ✅ 验证清单

修复后检查：

- [x] 输入序列号时不自动填充型号
- [x] 内部型号只对非reporter显示
- [x] 用户必须手动选择客户型号
- [x] 序列号验证仍然正常工作
- [x] 维修报告使用客户型号
- [x] Excel导出使用客户型号
- [x] 权限控制正确实现

---

## 📝 相关文件

| 文件 | 说明 |
|------|------|
| `components/repair-form.tsx` | 表单组件（已修复） |
| `app/api/device/check/route.ts` | 序列号验证API |
| `prisma/schema.prisma` | 数据模型定义 |
| `Device_Inventory` | 内部型号表 |
| `Product_Catalog` | 客户型号表 |

---

## 🎓 总结

**核心理念**：
1. ✅ 序列号检索 = 验证设备存在性
2. ✅ 三级下拉框 = 选择客户型号
3. ✅ 两种型号各司其职，不混用
4. ✅ 权限控制确保信息隔离

**记住**：内部型号是内部用的，客户型号是给客户看的！
