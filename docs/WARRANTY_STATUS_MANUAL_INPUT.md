# 保修状态人工判定功能

**实施日期**: 2026-02-26  
**功能**: 仓库管理员在确认批次设备时，需人工判定保修状态  
**状态**: ✅ 已完成

---

## 📋 需求背景

由于公司内部没有统一的保修期标准（不同产品线、不同客户可能有不同的保修政策），**保修状态不能通过出厂日期自动计算**，必须由仓库管理员根据以下因素人工判定：

- 产品出厂日期
- 产品类别和型号
- 客户合同中的保修条款
- 历史维修记录
- 特殊保修协议

---

## ✨ 功能说明

### 1. 保修状态选项

仓库管理员可以为每台设备选择以下三种状态之一：

| 状态值 | 显示名称 | 颜色标识 | 含义 |
|--------|---------|---------|------|
| `InWarranty` | 在保 | 🟢 绿色 | 设备在保修期内 |
| `OutOfWarranty` | 过保 | 🟠 橙色 | 设备已过保修期 |
| `Unknown` | 未知 | ⚪ 灰色 | 保修状态待确定（默认值）|

### 2. 操作流程

```
1. 仓库管理员登录系统
   ↓
2. 进入"待确认批次"列表
   ↓
3. 选择一个批次进入确认页面
   ↓
4. 为每台设备填写：
   - 出厂日期（日历选择器）
   - 保修状态（下拉选择框）
   ↓
5. 点击"确认批次设备"按钮
   ↓
6. 系统保存并更新工单状态为"仓库已确认"
```

---

## 🖥️ 界面展示

### 仓库确认界面

设备列表表格新增"保修状态"列：

| 序号 | 设备序列号 | 产品型号 | 物料名称 | 故障描述 | 出厂日期 * | 保修状态 * |
|------|----------|---------|---------|---------|----------|-----------|
| 1 | N74C1120 | UNC-100 | - | 控制器失灵 | [选择日期] | [在保 ▼] |
| 2 | N76J2501 | UNC-100 | - | 控制器失灵 | [选择日期] | [过保 ▼] |
| 3 | K2025040134 | R100 | - | 屏幕不亮 | [选择日期] | [未知 ▼] |

**界面特点**:
- ✅ 必填字段标记为 `*`
- ✅ 未填写的字段以红色边框提示
- ✅ 下拉菜单中状态选项带有颜色圆点标识
- ✅ 确认后不可编辑（除非点击"编辑出厂日期"按钮）

---

## 🔧 技术实现

### 前端修改

**文件**: `components/warehouse-batch-confirm.tsx`

**关键修改**:

1. **添加状态管理**:
```typescript
const [warrantyStatuses, setWarrantyStatuses] = useState<Record<string, string>>({})
```

2. **初始化保修状态**:
```typescript
const warranties: Record<string, string> = {}
result.data.devices.forEach((device: Device) => {
  warranties[device.id] = device.warrantyStatus || "Unknown"
})
setWarrantyStatuses(warranties)
```

3. **添加选择框组件**:
```typescript
<Select
  value={warrantyStatuses[device.id] || "Unknown"}
  onValueChange={(value) => {
    setWarrantyStatuses(prev => ({
      ...prev,
      [device.id]: value
    }))
  }}
>
  <SelectTrigger>
    <SelectValue placeholder="请选择" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="InWarranty">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        在保
      </span>
    </SelectItem>
    <SelectItem value="OutOfWarranty">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-500" />
        过保
      </span>
    </SelectItem>
    <SelectItem value="Unknown">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        未知
      </span>
    </SelectItem>
  </SelectContent>
</Select>
```

4. **提交时包含保修状态**:
```typescript
body: JSON.stringify({
  devices: devices.map(device => ({
    id: device.id,
    manufactureDate: manufactureDates[device.id]?.toISOString(),
    warrantyStatus: warrantyStatuses[device.id] || "Unknown"
  }))
})
```

### 后端修改

**文件**: `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts`

**关键修改**:

1. **接收保修状态参数**:
```typescript
updateRequest.input("warrantyStatus", device.warrantyStatus || "Unknown")
```

2. **更新数据库**:
```sql
UPDATE Repair_Tickets
SET 
  ManufactureDate = @manufactureDate,
  WarrantyStatus = @warrantyStatus,  -- 新增
  Status = @newStatus,
  UpdatedAt = GETDATE(),
  WarehouseConfirmedAt = GETDATE(),
  WarehouseConfirmedBy = @operatorName
WHERE Id = @ticketId
```

3. **审计日志记录保修状态**:
```typescript
const warrantyText = device.warrantyStatus === "InWarranty" ? "在保" : 
                    device.warrantyStatus === "OutOfWarranty" ? "过保" : "未知";

historyRequest.input("actionNote", 
  `仓库确认设备，出厂日期：${manufactureDate}，保修状态：${warrantyText}`
);
```

### 数据库字段

**表**: `Repair_Tickets`  
**字段**: `WarrantyStatus` (NVARCHAR(50), NULL)  
**允许值**: 
- `InWarranty` - 在保
- `OutOfWarranty` - 过保
- `Unknown` - 未知（默认）

该字段已在之前的迁移脚本中添加：
```bash
npm run add-workflow-fields
```

---

## 📊 审计日志示例

仓库管理员确认设备后，系统会在 `Repair_Ticket_History` 表中记录：

```
TicketID: 12345
ActionType: StatusChange
OldStatus: Created
NewStatus: WarehouseConfirmed
ActionBy: 张三
ActionNote: 仓库确认设备，出厂日期：2026-02-18，保修状态：在保
CreatedAt: 2026-02-26 15:30:00
```

---

## ⚠️ 注意事项

### 1. 保修状态不能自动计算

❌ **错误做法**:
```javascript
// 不要根据出厂日期自动计算保修状态
const warrantyStatus = isWithinWarrantyPeriod(manufactureDate) 
  ? "InWarranty" 
  : "OutOfWarranty";
```

✅ **正确做法**:
```javascript
// 保修状态必须由仓库管理员手动选择
const warrantyStatus = userSelectedValue; // "InWarranty" | "OutOfWarranty" | "Unknown"
```

### 2. 默认值为"未知"

新创建的工单，保修状态默认为 `Unknown`，直到仓库管理员明确选择。

### 3. 保修状态与收费的关系

- **在保设备**: 通常免费维修（但需商务确认）
- **过保设备**: 通常收费维修
- **未知状态**: 需要进一步核实后再决定

保修状态会影响后续的商务审核流程，但**不会自动触发收费/免费决策**，最终由商务人员确认。

### 4. 编辑权限

- **仓库管理员**: 可在确认时设置，确认后可通过"编辑出厂日期"功能修改
- **其他角色**: 只读，不可修改

---

## 🔍 测试验证

### 测试场景 1: 正常确认流程

1. 仓库管理员选择批次
2. 为所有设备填写出厂日期和保修状态
3. 点击确认
4. **预期**: 成功保存，状态更新为"仓库已确认"

### 测试场景 2: 未选择保修状态

1. 仓库管理员填写出厂日期
2. 保修状态保持"未知"（默认值）
3. 点击确认
4. **预期**: 成功保存，保修状态为"未知"

### 测试场景 3: 编辑保修状态

1. 批次已确认
2. 点击"编辑出厂日期"
3. 修改某设备的保修状态
4. **预期**: 保修状态更新成功

### 测试场景 4: 查看历史记录

1. 查看工单历史记录
2. **预期**: 能看到保修状态的记录：
   ```
   仓库确认设备，出厂日期：2026-02-18，保修状态：在保
   ```

---

## 📚 相关文档

- [工作流字段迁移文档](./WORKFLOW_FIELDS_MIGRATION.md)
- [仓库确认批次 Bug 修复](./WAREHOUSE_CONFIRM_BATCH_FIX.md)
- [数据库连接池修复](./DATABASE_CONNECTION_POOL_FIX.md)

---

## 🎯 用户反馈

> "保修状态是不用计算的因为我们自己也没有一套具体的标准所以只能人工核对日期"  
> —— 用户需求，2026-02-26

**解决方案**: ✅ 已实现人工判定保修状态功能，仓库管理员可根据实际情况灵活选择。

---

**文档版本**: v1.0  
**最后更新**: 2026-02-26  
**维护人员**: AI Assistant
