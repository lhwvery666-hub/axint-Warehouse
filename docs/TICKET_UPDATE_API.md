# 工单更新 API 使用说明

## 接口地址

```
PUT /api/tickets/[id]
```

## 功能特性

1. **支持部分更新**：可以只更新需要修改的字段，不需要传递所有字段
2. **自动状态流转**：根据字段更新自动触发状态变更
3. **物料代码自动匹配**：更新 ProductSN 或 ModelName 时自动补全 MaterialCode 和 FullSpec

## 请求格式

```json
{
  // 现场人员填报区字段（可选）
  "submitDate": "2026-01-22T10:00:00Z",
  "trackingNumberIn": "SF1234567890",
  "senderAddress": "北京市朝阳区xxx",
  "contactInfo": "张三 13800138000",
  "projectName": "XX项目",
  "category": "控制器",
  "modelName": "AX-TRC2",
  "quantity": 1,
  "productSN": "SN123456",
  "faultDescription": "设备无法启动",
  
  // 维修人员填写区字段（可选）
  "materialCode": "MC001",
  "deviceName": "门禁控制器",
  "fullSpec": "AX-TRC2 标准版",
  "faultPoint": "电源模块故障",
  
  // 管理员填写区字段（可选）
  "isChargeable": true,
  "factoryRepairDate": "2026-01-25T10:00:00Z",
  "factoryTrackingNum": "SF9876543210",
  "supplierName": "XX供应商",
  "repairCost": 500.00,
  "clientName": "XX公司",
  "isInvoiced": false,
  
  // 仓库管理员填写区字段（可选）
  "receivedDate": "2026-01-20T10:00:00Z",
  "factoryShipDate": "2026-01-30T10:00:00Z",
  "returnDate": "2026-02-01T10:00:00Z",
  "returnQuantity": 1,
  "returnTrackingNum": "SF1112223334",
  
  // 状态字段（可选，如果不传则根据自动流转规则更新）
  "status": "In_Repair"
}
```

## 自动状态流转规则

### 规则 1：维修人员填写故障点
- **触发条件**：更新 `faultPoint` 字段且当前状态为 `Created` 或 `Pending`
- **自动操作**：状态自动流转为 `Admin_Review` (待商务处理)
- **前提**：前端没有显式传递 `status` 字段

### 规则 2：仓库管理员填写返还单号
- **触发条件**：更新 `returnTrackingNum` 字段
- **自动操作**：状态自动流转为 `Completed` (已完成)
- **前提**：前端没有显式传递 `status` 字段

**注意**：如果前端显式传递了 `status` 字段，则使用前端传递的值，不会触发自动流转。

## 物料代码自动匹配

### 触发条件
- 更新 `productSN` 字段，且当前 `MaterialCode` 或 `FullSpec` 为空
- 更新 `modelName` 字段，且当前 `MaterialCode` 或 `FullSpec` 为空

### 自动操作
1. 根据 `productSN` 查询 `Device_Inventory` 表
2. 如果找到匹配记录：
   - 如果 `MaterialCode` 为空，自动填充 `Device_Inventory.MaterialCode`
   - 如果 `FullSpec` 为空，自动填充 `Device_Inventory.ModelName` 或 `DeviceName`

### 注意事项
- 只有当 `productSN` 不为 `"PENDING"` 时才会查询
- 如果查询失败，不影响主更新流程，只记录错误日志

## 响应格式

### 成功响应

```json
{
  "success": true,
  "message": "工单更新成功",
  "data": {
    "updatedFields": 5,
    "statusChanged": true,
    "oldStatus": "Created",
    "newStatus": "Admin_Review",
    "autoStatusChange": "状态自动流转: Created -> Admin_Review",
    "materialCodeAutoFilled": true
  }
}
```

### 错误响应

```json
{
  "success": false,
  "message": "工单不存在",
  "error": "详细错误信息"
}
```

## 使用示例

### 示例 1：维修人员填写故障点

```javascript
const response = await fetch('/api/tickets/123', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    faultPoint: '电源模块故障，需要更换',
    fullSpec: 'AX-TRC2 标准版'
  })
});

const result = await response.json();
// 状态会自动从 Created 流转为 Admin_Review
```

### 示例 2：仓库管理员填写返还单号

```javascript
const response = await fetch('/api/tickets/123', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    returnTrackingNum: 'SF1112223334',
    returnDate: '2026-02-01T10:00:00Z'
  })
});

const result = await response.json();
// 状态会自动流转为 Completed
```

### 示例 3：更新 ProductSN 并自动补全物料代码

```javascript
const response = await fetch('/api/tickets/123', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    productSN: 'SN123456789'
  })
});

const result = await response.json();
// 如果 MaterialCode 或 FullSpec 为空，会自动从 Device_Inventory 表补全
```

## 字段类型说明

| 字段类型 | 处理方式 |
|---------|---------|
| 字符串 | 自动 trim，空字符串转为 NULL |
| 整数 (quantity, returnQuantity) | 转换为 Number，无效值忽略 |
| 小数 (repairCost) | 转换为 Number，无效值忽略 |
| 布尔值 (isChargeable, isInvoiced) | true/1/"true" → 1, 其他 → 0 |
| 日期时间 | 支持 Date 对象或 ISO 字符串 |

## 注意事项

1. **部分更新**：只需要传递需要更新的字段，不需要传递所有字段
2. **字段验证**：API 会自动检查字段是否存在，不存在的字段会被忽略
3. **状态优先级**：如果前端传递了 `status`，则使用前端值，不会触发自动流转
4. **物料代码匹配**：只有在 `MaterialCode` 或 `FullSpec` 为空时才会自动补全
5. **历史记录**：状态变更会自动记录到 `Repair_Ticket_History` 表
