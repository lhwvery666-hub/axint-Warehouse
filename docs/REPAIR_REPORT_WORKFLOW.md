# 维修报告打印流程说明

## 📋 业务流程

```
维修人员填写报告 → 保存并发送 → 现场人员接收 → 下载打印 → 客户签字 → 回传商务
```

## 🔄 详细步骤

### 1️⃣ 维修人员填写报告

**页面**: `/repairs/edit/[id]`

**操作**:
1. 打开工单详情，点击"填写维修报告"
2. 填写维修项目：
   - 设备型号
   - 数量
   - 产品序列号
   - 维修主要内容
   - 维修费用
   - 改善意见
3. 填写备注信息
4. 点击"保存并发送"

**API**: `PUT /api/tickets/[id]/repair-report`

---

### 2️⃣ 现场人员接收通知

**方式**:
- 系统内通知
- 邮件通知（如果配置）
- 短信通知（如果配置）

**内容**:
> 工单 [WO001] 的维修报告已生成，请下载打印并让客户签字确认。

---

### 3️⃣ 现场人员下载打印

**页面**: `/repairs/print/[id]`

**操作**:
1. 在工单详情页点击"下载维修报告"
2. 系统打开打印页面
3. 点击"打印报告"按钮
4. 选择打印机打印（A4纸）

**特点**:
- ✅ 像素级还原CSV格式
- ✅ A4纸张适配
- ✅ 黑白打印友好
- ✅ 包含所有必要信息
- ✅ 预留客户签字区域

---

### 4️⃣ 客户签字确认

**现场操作**:
1. 将打印的维修报告交给客户
2. 客户阅读维修内容和费用
3. 客户选择：
   - ☑️ 同意维修
   - ☑️ 不维修，请寄回
   - ☑️ 不维修，请丢弃
4. 客户签字并盖章
5. 填写日期

**注意事项**:
- 必须在3个工作日内回复
- 逾期将以不同意维修处理

---

### 5️⃣ 回传商务

**操作**:
1. 拍照或扫描签字后的报告
2. 在系统中上传
3. 提交客户确认结果

**API**: `POST /api/tickets/[id]/customer-confirm`

```json
{
  "confirmation": "Agreed",  // Agreed/Rejected
  "needReturnShip": true,
  "customerSignature": "/uploads/signature.jpg"
}
```

---

## 📄 报告格式说明

### 报告结构

```
┌─────────────────────────────────────────┐
│     深圳市爱克信智能股份有限公司          │
│           产品维修单                     │
├─────────────────────────────────────────┤
│ 收货日期：2024-01-15  维修单号：WO001   │
├─────────────────────────────────────────┤
│ 客户名称：XX公司    项目名称：XX项目     │
│ 客户地址：XX地址    联系人/电话：XX      │
│ FROM：张三          是否过保：是         │
├─────────────────────────────────────────┤
│ 设备型号 │数量│序列号│维修内容│费用│意见│
├─────────────────────────────────────────┤
│ (8行数据区域)                            │
├─────────────────────────────────────────┤
│ 合计：2台    维修费用合计：¥500         │
├─────────────────────────────────────────┤
│ 备注：                                   │
├─────────────────────────────────────────┤
│ 请确认是否维修：                         │
│ □ 同意维修                               │
│ □ 不维修，请寄回    客户确认：(盖章)    │
│ □ 不维修，请丢弃    日期：               │
├─────────────────────────────────────────┤
│ 联系人：黄工 电话：13530978726          │
│ 地址：深圳市宝安区...                   │
└─────────────────────────────────────────┘
```

### 关键字段

| 字段 | 来源 | 说明 |
|------|------|------|
| 收货日期 | ReceivedDate | 仓库收货日期 |
| 维修单号 | WorkOrderNumber | 工单号 |
| 客户名称 | ClientName | 客户公司名称 |
| 项目名称 | ProjectName | 项目名称 |
| 联系人/电话 | ContactInfo | 联系方式 |
| FROM | ReporterName | 报修人 |
| 是否过保 | WarrantyStatus | 保修状态 |
| 设备型号 | ModelName | 产品型号 |
| 数量 | Quantity | 产品数量 |
| 序列号 | ProductSN | 序列号（可选） |
| 维修内容 | FaultDescription | 故障描述 |
| 维修费用 | RepairCost | 维修费用 |

---

## 🔧 技术实现

### 文件结构

```
app/
├── repairs/
│   ├── edit/[id]/page.tsx      # 维修人员填写页面
│   └── print/[id]/page.tsx     # 打印页面
└── api/
    └── tickets/[id]/
        └── repair-report/route.ts  # 报告API
```

### API端点

#### 1. 获取报告数据
```bash
GET /api/tickets/[id]/repair-report
```

**响应**:
```json
{
  "success": true,
  "data": {
    "ticketId": "123",
    "receiveDate": "2024-01-15",
    "repairNumber": "WO001",
    "customerName": "XX公司",
    "items": [
      {
        "deviceModel": "Model-A",
        "quantity": 1,
        "serialNumber": "SN001",
        "repairContent": "电源模块损坏",
        "repairCost": 500,
        "improvements": "建议定期检查"
      }
    ],
    "totalQuantity": 2,
    "totalCost": 500
  }
}
```

#### 2. 更新报告内容
```bash
PUT /api/tickets/[id]/repair-report
```

**请求**:
```json
{
  "items": [
    {
      "deviceModel": "Model-A",
      "quantity": 1,
      "serialNumber": "SN001",
      "repairContent": "电源模块损坏",
      "repairCost": 500,
      "improvements": "建议定期检查"
    }
  ],
  "remarks": "备注信息",
  "totalCost": 500
}
```

---

## 🎨 打印样式

### CSS打印优化

```css
@media print {
  @page {
    size: A4;
    margin: 10mm;
  }
  
  /* 隐藏打印按钮 */
  .print:hidden {
    display: none !important;
  }
  
  /* 表格不分页 */
  table {
    page-break-inside: avoid;
  }
}
```

### 表格布局

- 使用 HTML Table（不用 Flex）
- colSpan 实现单元格合并
- 固定行高确保对齐
- 黑色边框 (border-black)

---

## 📱 使用示例

### 维修人员操作

```typescript
// 1. 打开填写页面
router.push(`/repairs/edit/${ticketId}`);

// 2. 填写维修项目
const items = [
  {
    deviceModel: 'Model-A',
    quantity: 1,
    serialNumber: 'SN001',
    repairContent: '电源模块损坏',
    repairCost: 500,
    improvements: '建议定期检查'
  }
];

// 3. 保存报告
await fetch(`/api/tickets/${ticketId}/repair-report`, {
  method: 'PUT',
  body: JSON.stringify({ items, remarks, totalCost })
});

// 4. 预览打印
window.open(`/repairs/print/${ticketId}`, '_blank');
```

### 现场人员操作

```typescript
// 1. 接收通知后打开打印页面
router.push(`/repairs/print/${ticketId}`);

// 2. 点击打印按钮
window.print();

// 3. 客户签字后上传
await fetch(`/api/tickets/${ticketId}/customer-confirm`, {
  method: 'POST',
  body: JSON.stringify({
    confirmation: 'Agreed',
    customerSignature: signatureUrl
  })
});
```

---

## ⚠️ 注意事项

### 1. 数据完整性
- 确保所有必填字段已填写
- 维修费用必须准确
- 序列号如有多个需分行显示

### 2. 打印质量
- 使用A4纸张
- 黑白打印即可
- 确保边框清晰
- 签字区域留白充足

### 3. 时效性
- 客户必须在3个工作日内回复
- 逾期按不同意维修处理
- 及时上传签字后的报告

### 4. 权限控制
- 只有维修人员可以填写报告
- 只有现场人员可以提交客户确认
- 商务人员可以查看所有报告

---

## 🔗 相关功能

| 功能 | 页面/API | 说明 |
|------|----------|------|
| 填写报告 | `/repairs/edit/[id]` | 维修人员填写 |
| 打印报告 | `/repairs/print/[id]` | 现场人员打印 |
| 获取报告 | `GET /api/tickets/[id]/repair-report` | 获取数据 |
| 更新报告 | `PUT /api/tickets/[id]/repair-report` | 保存数据 |
| 客户确认 | `POST /api/tickets/[id]/customer-confirm` | 提交确认 |

---

## 📊 数据流转

```
┌─────────────┐
│  工单创建   │
└──────┬──────┘
       ↓
┌─────────────┐
│  维修检测   │
└──────┬──────┘
       ↓
┌─────────────┐
│ 填写报告 ←──┼── 维修人员
└──────┬──────┘
       ↓
┌─────────────┐
│ 保存到数据库│
└──────┬──────┘
       ↓
┌─────────────┐
│ 通知现场人员│
└──────┬──────┘
       ↓
┌─────────────┐
│ 下载打印 ←──┼── 现场人员
└──────┬──────┘
       ↓
┌─────────────┐
│ 客户签字    │
└──────┬──────┘
       ↓
┌─────────────┐
│ 上传确认 ←──┼── 现场人员
└──────┬──────┘
       ↓
┌─────────────┐
│ 商务处理    │
└─────────────┘
```

---

## ✅ 检查清单

发布前检查：

- [ ] 报告格式正确（像素级还原）
- [ ] 打印样式正常（A4纸）
- [ ] 所有字段正确显示
- [ ] 勾选框可用
- [ ] 签字区域充足
- [ ] 联系方式正确
- [ ] API接口正常
- [ ] 权限控制正确
- [ ] 通知功能正常
- [ ] 文件上传正常

---

## 🎓 总结

维修报告打印功能实现了：
1. ✅ 像素级还原CSV格式
2. ✅ 维修人员在线填写
3. ✅ 现场人员下载打印
4. ✅ 客户签字确认流程
5. ✅ 数据自动流转
6. ✅ A4纸打印优化

这个功能完善了整个维修工单的闭环流程！
