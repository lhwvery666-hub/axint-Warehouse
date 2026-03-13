# 维修报告打印布局重新设计

## 📋 问题描述

用户反馈：**"这个报告太丑了吧"**

原有报告：
- ❌ 简单的文字布局，没有表格边框
- ❌ 没有公司抬头
- ❌ 格式很简陋，不专业
- ❌ 没有明确的区域划分

用户要求：
- ✅ 参考第二张图的专业格式
- ✅ 使用表格布局，带边框
- ✅ 添加公司抬头
- ✅ 整体更专业、更正规

---

## 🎨 重新设计方案

### 新布局结构

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃         公司名称                 ┃
┃       设备维修报告               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┌────────┬──────┬────────┬──────┐
│工单号  │ XXX  │项目名称│ XXX  │
├────────┼──────┼────────┼──────┤
│客户名称│ XXX  │联系方式│ XXX  │
├────────┴──────┴────────┴──────┤
│客户地址│ XXXXXXXXXXXXXXXXXX   │
├────────┬──────┬────────┬──────┤
│接收日期│ XXX  │完成日期│ XXX  │
└────────┴──────┴────────┴──────┘

┌─────────────────────────────────┐
│  序号 │ 设备型号 │ ... │ 费用   │
├───────┼─────────┼─────┼────────┤
│   1   │   XXX   │ ... │ 100.00 │
│   2   │   XXX   │ ... │ 200.00 │
├───────┴─────────┴─────┴────────┤
│ 合计：2                 ¥300.00│
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 备注                            │
│ XXXXXXXXXXXXXXXXXXXXXX          │
└─────────────────────────────────┘

┌───────────┬───────────┬─────────┐
│维修负责人：│  审核人：  │  日期： │
└───────────┴───────────┴─────────┘
```

---

## ✅ 实施内容

### 1. 样式文件重构 (`styles/print.css`)

#### 新增样式类

**公司抬头**
```css
.report-header {
  text-align: center;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
}

.company-name {
  font-size: 24px;
  font-weight: bold;
  color: #000;
}

.report-title {
  font-size: 20px;
  font-weight: bold;
  color: #000;
}
```

**信息表格**
```css
.info-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #000;
}

.info-table td {
  border: 1px solid #000;
  padding: 8px 12px;
}

.label-cell {
  background-color: #f5f5f5;
  font-weight: 600;
  width: 18%;
  text-align: center;
}

.value-cell {
  width: 32%;
  color: #333;
}
```

**维修明细表**
```css
.detail-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #000;
}

.detail-table th {
  background-color: #f5f5f5;
  border: 1px solid #000;
  padding: 10px 8px;
  font-weight: 600;
  text-align: center;
}

.detail-table td {
  border: 1px solid #000;
  padding: 8px;
  text-align: center;
}

.detail-table .total-row td {
  font-weight: bold;
  background-color: #f9f9f9;
}
```

**签字区域**
```css
.signature-section {
  display: flex;
  border: 1px solid #000;
}

.signature-item {
  flex: 1;
  text-align: center;
  padding: 40px 10px 15px;
  border-left: 1px solid #000;
}

.signature-item:first-child {
  border-left: none;
}
```

---

### 2. HTML 结构重构 (`app/repairs/print/[id]/page.tsx`)

#### 旧结构（简陋）
```jsx
<h1>设备维修报告</h1>
<div>工单号：XXX</div>
<div>项目名称：XXX</div>
...
<table>...</table>
```

#### 新结构（专业）
```jsx
<div className="report-header">
  <div className="company-name">{getCompanyName()}</div>
  <div className="report-title">设备维修报告</div>
</div>

<table className="info-table">
  <tr>
    <td className="label-cell">工单号</td>
    <td className="value-cell">XXX</td>
    <td className="label-cell">项目名称</td>
    <td className="value-cell">XXX</td>
  </tr>
  ...
</table>

<table className="detail-table">
  <thead>...</thead>
  <tbody>...</tbody>
  <tfoot>...</tfoot>
</table>

<div className="remarks-section">
  <div className="remarks-title">备注</div>
  <div className="remarks-content">...</div>
</div>

<div className="signature-section">
  <div className="signature-item">维修负责人：</div>
  <div className="signature-item">审核人：</div>
  <div className="signature-item">日期：</div>
</div>
```

---

### 3. 公司信息配置 (`lib/company-config.ts`)

**新增配置文件**，方便管理公司信息：

```typescript
export const COMPANY_CONFIG = {
  name: "公司名称",
  fullName: "公司全称",
  address: "",
  phone: "",
  fax: "",
  email: "",
} as const;

export function getCompanyName(): string {
  return COMPANY_CONFIG.name;
}
```

**使用方法**：
```typescript
import { getCompanyName } from '@/lib/company-config';

// 在页面中使用
<div className="company-name">{getCompanyName()}</div>
```

**自定义公司名称**：
只需修改 `lib/company-config.ts` 中的 `name` 字段即可。

---

## 📊 对比效果

### 优化前 ❌

```
设备维修报告
工单号：WO2602249788
项目名称：矿石
客户名称：-
联系方式：王一 13603050631
客户地址：JNJSBVIWVJKNDVJN
接收日期：2026-02-24

维修明细
序号 设备型号 序列号 数量 维修内容 改进建议 维修费用(元)
1    通用电源N77E14061 有问题 做防水处理 0.00
2    通用电源N77I09631 有问题 做防水处理 500.00
合计： 2                            ¥500.00

维修负责人：_____ 审核人：_____ 日期：_____
```

**问题**：
- ❌ 没有边框，看起来很乱
- ❌ 没有公司抬头
- ❌ 字段标签和值没有明确区分
- ❌ 整体不专业

---

### 优化后 ✅

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃         公司名称                 ┃
┃       设备维修报告               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┌────────┬─────────────┬────────┬─────────────┐
│工单号  │ WO2602249788 │项目名称│ 矿石        │
├────────┼─────────────┼────────┼─────────────┤
│客户名称│ -           │联系方式│王一 13603...│
├────────┴─────────────┴────────┴─────────────┤
│客户地址│ JNJSBVIWVJKNDVJN                    │
├────────┬─────────────┬────────┬─────────────┤
│接收日期│ 2026-02-24  │完成日期│ -           │
└────────┴─────────────┴────────┴─────────────┘

┌──┬────────────┬────────────┬──┬──────┬──────┬────────┐
│序│ 设备型号    │ 序列号      │数│维修内│改进建│维修费用│
│号│            │            │量│容    │议    │(元)    │
├──┼────────────┼────────────┼──┼──────┼──────┼────────┤
│1 │通用电源     │N77E14061   │1 │有问题│做防水│  0.00  │
│  │            │            │  │      │处理  │        │
├──┼────────────┼────────────┼──┼──────┼──────┼────────┤
│2 │通用电源     │N77I09631   │1 │有问题│做防水│500.00  │
│  │            │            │  │      │处理  │        │
├──┴────────────┴────────────┼──┴──────┴──────┼────────┤
│ 合计：                     │ 2               │¥500.00 │
└────────────────────────────┴─────────────────┴────────┘

┌─────────────────────────────────────────────────────┐
│ 备注                                                │
│ 无                                                  │
└─────────────────────────────────────────────────────┘

┌──────────────┬──────────────┬──────────────┐
│维修负责人：  │  审核人：    │  日期：      │
│              │              │              │
│              │              │              │
└──────────────┴──────────────┴──────────────┘
```

**改进**：
- ✅ 完整的表格边框
- ✅ 公司抬头居中显示
- ✅ 字段标签使用灰色背景突出
- ✅ 签字区域更专业
- ✅ 整体非常专业正规

---

## 📱 响应式设计

### 桌面端（打印）
- 使用完整的表格布局
- 所有边框清晰可见
- 字号适中，易于阅读

### 移动端（屏幕查看）
- 自动缩小字号
- 表格自适应宽度
- 签字区域改为垂直布局

```css
@media screen and (max-width: 768px) {
  .company-name {
    font-size: 20px;
  }
  
  .report-title {
    font-size: 18px;
  }
  
  .info-table td,
  .detail-table th,
  .detail-table td {
    font-size: 12px;
    padding: 6px;
  }
  
  .signature-section {
    flex-direction: column;
  }
}
```

---

## 🖨️ 打印设置

### A4 纸张设置
```css
@media print {
  @page {
    size: A4;
    margin: 15mm;
  }
}
```

### 打印优化
- 隐藏不需要打印的元素（`.no-print`）
- 保持颜色（`print-color-adjust: exact`）
- 避免表格跨页（`page-break-inside: avoid`）

---

## 🎯 使用方法

### 1. 自定义公司名称

编辑 `lib/company-config.ts`：

```typescript
export const COMPANY_CONFIG = {
  name: "您的公司名称",  // 修改这里
  fullName: "您的公司全称",
  address: "公司地址",
  phone: "联系电话",
  // ...
}
```

### 2. 查看报告

1. 进入任意维修工单详情
2. 点击"打印报告"或"查看维修报告"
3. 查看新的专业布局

### 3. 打印报告

1. 点击浏览器的打印按钮（或 Ctrl+P）
2. 选择A4纸张
3. 确认打印

---

## ✅ 测试清单

### 布局测试
- [ ] 公司抬头居中显示
- [ ] 信息表格有完整边框
- [ ] 标签单元格有灰色背景
- [ ] 维修明细表有完整边框
- [ ] 合计行有背景色
- [ ] 签字区域三等分

### 内容测试
- [ ] 所有字段正确显示
- [ ] 设备列表完整显示
- [ ] 费用计算正确
- [ ] 备注内容显示（如果有）

### 打印测试
- [ ] 打印预览布局正常
- [ ] 边框清晰可见
- [ ] 文字清晰易读
- [ ] 签字区域留有空白

### 响应式测试
- [ ] 桌面端显示正常
- [ ] 移动端显示正常
- [ ] 打印时显示正常

---

## 📝 修改文件清单

1. ✅ `styles/print.css` - 重新设计打印样式
2. ✅ `app/repairs/print/[id]/page.tsx` - 重构HTML结构
3. ✅ `lib/company-config.ts` - 新增公司信息配置

---

## 🚀 后续优化建议

### 1. 更多自定义选项
- 报告模板选择（样式A/B/C）
- 颜色主题自定义
- Logo上传功能

### 2. 打印选项
- 选择是否显示费用
- 选择是否显示备注
- 自定义页眉页脚

### 3. 导出功能
- 导出为PDF
- 导出为Excel
- 批量打印

---

## 📊 改进总结

| 项目 | 优化前 | 优化后 |
|-----|--------|--------|
| 表格边框 | ❌ 无 | ✅ 完整边框 |
| 公司抬头 | ❌ 无 | ✅ 居中显示 |
| 信息布局 | ❌ 文字列表 | ✅ 表格布局 |
| 字段区分 | ❌ 不明显 | ✅ 背景色区分 |
| 签字区域 | ❌ 简陋 | ✅ 专业表格 |
| 整体专业度 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

---

**优化完成日期**：2026-02-24  
**设计师**：AI Assistant  
**状态**：✅ 已完成，待测试
