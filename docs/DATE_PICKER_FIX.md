# 日期选择器统一和年份快速跳转功能

## 📋 问题描述

用户反馈：在仓库管理页面的"编辑工单信息"表单中，日期选择器存在以下问题：
1. **大小不一致**：不同日期选择器的尺寸不统一，影响视觉体验
2. **缺少年份跳转**：无法快速选择不同年份，需要逐月点击

### 问题截图
- 第一张图：收到日期选择器（较大）
- 第二张图：返还客户日期选择器（较小）

## 🔍 根本原因

### 原始代码
```typescript
<Calendar
  mode="single"
  selected={formData.returnDate || undefined}
  onSelect={(date) => setFormData({ ...formData, returnDate: date || null })}
  initialFocus
  locale={zhCN}
  // 缺少这些属性导致显示不一致
/>
```

### 问题分析
1. **缺少 `captionLayout` 属性**
   - 没有指定标题布局模式
   - 导致日历头部样式不一致

2. **缺少年份范围设置**
   - 没有 `fromYear` 和 `toYear` 属性
   - 无法快速跳转年份

## ✅ 修复方案

### 添加的属性

```typescript
<Calendar
  mode="single"
  selected={formData.returnDate || undefined}
  onSelect={(date) => setFormData({ ...formData, returnDate: date || null })}
  initialFocus
  locale={zhCN}
  // ✅ 新增：启用下拉选择按钮布局
  captionLayout="dropdown-buttons"
  // ✅ 新增：设置年份范围（2020-2030）
  fromYear={2020}
  toYear={2030}
/>
```

### 属性说明

#### 1. `captionLayout="dropdown-buttons"`
**作用**：启用日历标题的下拉选择模式
**效果**：
- 月份和年份显示为下拉选择框
- 提供更大的点击区域
- 统一日历头部的显示样式
- 支持快速跳转

#### 2. `fromYear={2020}` / `toYear={2030}`
**作用**：定义可选择的年份范围
**效果**：
- 年份下拉框显示 2020-2030 年
- 防止选择过早或过晚的日期
- 提高选择效率

### 修改的日期选择器

修改了仓库管理页面的所有3个日期选择器：

1. **收到日期** (`receivedDate`)
2. **出厂日期** (`factoryShipDate`)
3. **返还客户日期** (`returnDate`)

## 📊 修复效果

### 修复前 ❌
```
收到日期：
┌─────────────┐
│   三月 2025  │  ← 只能点击箭头切换月份
│  ←       →  │
│  日历内容    │
└─────────────┘

返还客户日期：
┌──────────┐
│ 三月 2025 │  ← 样式不一致
│ ←     →  │
│ 日历内容  │
└──────────┘
```

### 修复后 ✅
```
所有日期选择器统一样式：
┌─────────────────────────┐
│ [三月 ▼]  [2025 ▼]     │  ← 可以点击下拉选择
│                         │
│      日历内容            │
└─────────────────────────┘

年份下拉选择：
[2025 ▼]
├─ 2020
├─ 2021
├─ 2022
├─ 2023
├─ 2024
├─ 2025  ← 当前选中
├─ 2026
├─ 2027
├─ 2028
├─ 2029
└─ 2030
```

## 🎯 用户体验改进

### 改进前
- ❌ 日期选择器大小不一致
- ❌ 只能逐月点击箭头切换
- ❌ 跨年选择需要点击12次
- ❌ 视觉效果不统一

### 改进后
- ✅ 所有日期选择器大小一致
- ✅ 可以直接下拉选择年份
- ✅ 可以直接下拉选择月份
- ✅ 跨年选择只需1次点击
- ✅ 视觉效果统一美观
- ✅ 操作更加高效

## 🔧 修改的文件

```
✅ app/warehouse/tickets/page.tsx
   - 收到日期选择器添加年份跳转
   - 出厂日期选择器添加年份跳转
   - 返还客户日期选择器添加年份跳转
   - 统一所有日期选择器样式
```

## 📝 技术细节

### Shadcn UI Calendar 组件属性

```typescript
interface CalendarProps {
  mode: "single" | "range" | "multiple";
  selected?: Date | undefined;
  onSelect?: (date: Date | undefined) => void;
  locale?: Locale;
  
  // 新增的属性
  captionLayout?: "label" | "dropdown" | "dropdown-buttons";
  fromYear?: number;
  toYear?: number;
  fromMonth?: Date;
  toMonth?: Date;
}
```

### captionLayout 选项说明

1. **`"label"`**（默认）
   - 只显示月份和年份文本
   - 只能用箭头切换
   - 样式最简单

2. **`"dropdown"`**
   - 月份和年份为下拉框
   - 没有左右箭头
   - 只能用下拉选择

3. **`"dropdown-buttons"`**（推荐）✅
   - 月份和年份为下拉框
   - 保留左右箭头
   - 同时支持点击和下拉
   - 最灵活的选项

## 🧪 测试验证

### 测试步骤
1. **打开仓库管理页面**
   - 访问 `/warehouse/dashboard`
   - 点击"填写表格"

2. **测试收到日期**
   - 点击"收到日期"选择器
   - 确认显示下拉按钮
   - 点击年份下拉框
   - 验证显示 2020-2030 年

3. **测试出厂日期**
   - 点击"出厂日期"选择器
   - 确认与收到日期大小一致
   - 测试年份快速跳转

4. **测试返还客户日期**
   - 点击"返还客户日期"选择器
   - 确认与其他日期选择器一致
   - 测试跨年选择

5. **测试快速跳转**
   - 选择 2020 年
   - 选择 2030 年
   - 验证选择准确

### 预期结果
- ✅ 所有日期选择器大小完全一致
- ✅ 都显示月份和年份下拉按钮
- ✅ 年份范围为 2020-2030
- ✅ 可以快速跨年选择日期
- ✅ 左右箭头依然可用
- ✅ 视觉效果统一美观

## 🔮 扩展优化建议

### 1. 动态年份范围
```typescript
const currentYear = new Date().getFullYear();
<Calendar
  fromYear={currentYear - 5}  // 前5年
  toYear={currentYear + 5}    // 后5年
/>
```

### 2. 默认月份/年份
```typescript
<Calendar
  defaultMonth={new Date(2025, 2)} // 默认显示 2025年3月
/>
```

### 3. 限制可选日期
```typescript
<Calendar
  disabled={{
    before: new Date(2020, 0, 1),  // 2020年之前不可选
    after: new Date(2030, 11, 31), // 2030年之后不可选
  }}
/>
```

### 4. 周起始日
```typescript
<Calendar
  weekStartsOn={1}  // 0=周日, 1=周一
/>
```

## 📚 相关文档

- [Shadcn UI Calendar 文档](https://ui.shadcn.com/docs/components/calendar)
- [React DayPicker 文档](https://react-day-picker.js.org/)
- [date-fns 本地化](https://date-fns.org/v2.29.3/docs/I18n)

## ⚠️ 注意事项

1. **年份范围设置**
   - 根据业务需求调整 `fromYear` 和 `toYear`
   - 避免范围过大导致下拉框过长

2. **本地化**
   - 确保 `locale={zhCN}` 正确导入
   - 月份名称会自动本地化

3. **性能**
   - `captionLayout="dropdown-buttons"` 会增加少量 DOM 元素
   - 对性能影响可忽略不计

4. **浏览器兼容性**
   - 下拉选择器依赖现代浏览器
   - 支持 Chrome、Firefox、Edge、Safari

## 🎉 总结

通过添加 `captionLayout="dropdown-buttons"` 和年份范围设置，我们实现了：
- ✅ 日期选择器样式统一
- ✅ 年份快速跳转功能
- ✅ 更好的用户体验
- ✅ 更高的操作效率

---

**修复完成时间**: 2026-02-24  
**修复人员**: AI Assistant (Arch)
