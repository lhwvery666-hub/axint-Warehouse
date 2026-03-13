# 批次工单界面优化

## 优化背景

用户反馈：现场人员使用报修表单时，界面不够清晰，无法明确看出"这是一个包含多台设备的批次工单"，而不是多个独立的设备报修。

### 用户期望

创建报修时，应该明确提示：
- ✅ 这是一个**批次工单**（订单）
- ✅ 包含多台设备
- ✅ 所有设备共享相同的批次号
- ✅ 统一管理项目信息、联系人、快递信息

## 优化内容

### 1. 添加顶部批次工单提示卡片

**文件**: `components/repair-form.tsx`

当用户添加多个设备时，在表单顶部显示醒目的蓝色提示卡片：

```typescript
{deviceInputs.length > 1 && (
  <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100/50">
    <CardContent className="p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
          {deviceInputs.length}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 text-base mb-1">
            批次工单模式
          </h3>
          <p className="text-sm text-blue-800">
            您正在创建一个包含 {deviceInputs.length}台设备 的批次工单。
            提交后，所有设备将统一管理，共享相同的批次号、项目信息和快递信息。
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

**视觉效果：**
- 蓝色渐变背景
- 圆形数字徽章显示设备数量
- 清晰的文字说明

### 2. 优化设备信息卡片标题

**修改前：**
```typescript
<CardTitle>设备信息</CardTitle>
```

**修改后：**
```typescript
<div className="flex items-center gap-3">
  <CardTitle>设备信息</CardTitle>
  {deviceInputs.length > 1 && (
    <Badge variant="default" className="bg-blue-600">
      批次工单 ({deviceInputs.length}台)
    </Badge>
  )}
</div>
```

**效果：**
- 在"设备信息"旁边显示蓝色徽章
- 实时显示当前设备数量

### 3. 添加设备信息卡片说明

在设备信息卡片的 `CardDescription` 中添加说明：

```typescript
{deviceInputs.length > 1 && (
  <CardDescription className="text-xs mt-2 flex items-start gap-2">
    <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
    <span className="text-blue-800">
      您正在创建一个包含 {deviceInputs.length}台设备 的批次工单。
      这些设备将共享相同的批次号、项目信息、联系人和快递信息，提交后会生成一个统一的批次号。
    </span>
  </CardDescription>
)}
```

### 4. 优化数量选择器（已有功能）

**修改前：**
```typescript
<Label>数量</Label>
<Select>
  <SelectItem value="1">1</SelectItem>
  <SelectItem value="2">2</SelectItem>
</Select>
```

**修改后：**
```typescript
<div className="flex items-center justify-between">
  <Label>报修数量 *</Label>
  {quantity > 1 && (
    <Badge variant="secondary">批次工单 ({quantity}台设备)</Badge>
  )}
</div>
<Select>
  <SelectItem value="1">1台（单个设备）</SelectItem>
  <SelectItem value="2">2台（批次工单）</SelectItem>
  // ...
</Select>
{quantity > 1 && (
  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
    <Info />
    您正在创建一个包含 {quantity}台设备 的批次工单，
    这些设备将被统一管理，共享相同的项目信息、联系人和快递信息。
  </div>
)}
```

### 5. 优化提交按钮文案

**修改前：**
```typescript
{deviceInputs.length === 1 ? "提交故障报告" : `提交 ${deviceInputs.length} 个故障报告`}
```

**修改后：**
```typescript
{deviceInputs.length === 1 ? "提交工单" : `提交批次工单 (${deviceInputs.length}台设备)`}
```

**提交中状态：**
```typescript
{deviceInputs.length === 1 ? "提交工单..." : `提交批次工单... (${deviceInputs.length}台设备)`}
```

### 6. 优化成功提示消息

**修改前：**
```typescript
alert(`批量创建成功！\n已创建 ${successCount} 个工单，批次号：${batchId}`)
```

**修改后：**
```typescript
alert(`✅ 批次工单创建成功！\n\n批次号：${batchId}\n设备数量：${successCount}台\n\n这些设备已关联到同一个批次工单中，可以统一管理。`)
```

## 用户体验提升

### 优化前 ❌

用户添加多个设备时：
- ❌ 看不出这是一个批次工单
- ❌ 以为是创建多个独立的工单
- ❌ 不清楚批次工单的含义
- ❌ 按钮文案容易产生误解

### 优化后 ✅

用户添加多个设备时：
- ✅ 顶部显示醒目的蓝色批次工单提示卡片
- ✅ 设备信息标题旁边显示蓝色徽章
- ✅ 数量选择器清晰标注"批次工单"
- ✅ 提交按钮明确显示"提交批次工单"
- ✅ 成功提示详细说明批次号和设备数量

## 视觉设计

### 颜色方案

- **蓝色系**：用于批次工单相关提示
  - `bg-blue-600`: 主要徽章背景
  - `bg-blue-50`: 提示卡片背景
  - `border-blue-200`: 提示卡片边框
  - `text-blue-800/900`: 文字颜色

### 组件层次

```
表单页面
├─ [批次工单提示卡片] (deviceInputs.length > 1 时显示)
│  ├─ 圆形数字徽章
│  ├─ "批次工单模式"标题
│  └─ 详细说明文字
├─ 左列
│  └─ 设备信息卡片
│     ├─ 标题 + 蓝色徽章 (多设备时显示)
│     ├─ 说明文字 (多设备时显示)
│     └─ 设备列表（可添加、复制、删除）
└─ 右列
   ├─ 客户信息
   ├─ 项目地点
   ├─ 快递信息
   └─ 提交按钮（文案根据设备数量变化）
```

## 批次工单的工作流程

### 1. 创建阶段

```
现场人员填写表单
    ↓
添加多个设备（点击"添加设备"）
    ↓
✅ 顶部显示"批次工单模式"提示卡片
    ↓
填写项目、联系人、快递信息（所有设备共享）
    ↓
点击"提交批次工单 (N台设备)"
    ↓
✅ 系统生成唯一的批次号（例如：WO2602249788）
```

### 2. API处理

**端点**: `POST /api/tickets/batch`

**请求数据：**
```json
{
  "customerInfo": {
    "name": "客户名称",
    "contact": "联系人",
    "phone": "电话",
    "address": "地址"
  },
  "items": [
    {
      "serialNumber": "N77E1406",
      "category": "开天配件",
      "subCategory": "通用电源",
      "modelSelected": "NC100-1M",
      "faultDescription": "有问题"
    },
    {
      "serialNumber": "N77I0963",
      "category": "开天配件",
      "subCategory": "通用电源",
      "modelSelected": "NC100-1M",
      "faultDescription": "有问题"
    }
  ],
  "shipment": {
    "expressCompany": "顺丰速运",
    "trackingNumber": "sf41565156",
    "senderAddress": "JNJSBVIWVJKNDJVJN"
  },
  "project": {
    "location": "广州分公司-前台"
  }
}
```

**响应数据：**
```json
{
  "success": true,
  "data": {
    "batchId": "WO2602249788",
    "count": 2
  }
}
```

### 3. 数据库存储

所有设备记录存储在 `Repair_Tickets` 表中：

| 字段 | 设备1 | 设备2 | 说明 |
|-----|------|------|------|
| ID | 1 | 2 | 设备唯一ID |
| BatchId | WO2602249788 | WO2602249788 | **相同的批次号** |
| DeviceSN | N77E1406 | N77I0963 | 设备序列号 |
| ProjectLocation | 广州分公司-前台 | 广州分公司-前台 | 共享 |
| ContactInfo | 王一 13603050631 | 王一 13603050631 | 共享 |
| TrackingNumber_In | sf41565156 | sf41565156 | 共享 |

### 4. 前端显示

在工单列表中，系统会自动将相同 `BatchId` 的设备**合并显示**为一个批次工单卡片：

```
工单列表
├─ 批次工单卡片
│  ├─ 工单号：WO2602249788
│  ├─ 项目：广州分公司-前台
│  ├─ 联系人：王一 (13603050631)
│  ├─ 设备数量：2台
│  └─ 点击 → 查看批次详情页
│     ├─ 流程时间线
│     ├─ 设备列表（N77E1406, N77I0963）
│     ├─ 工单沟通记录
│     └─ 签字凭证
```

## 批次工单 vs 单设备工单

| 特性 | 单设备工单 | 批次工单 |
|-----|-----------|---------|
| 设备数量 | 1台 | 2-50台 |
| 批次号 | 无 (BatchId = NULL) | 有 (WO + 日期 + 序号) |
| 显示方式 | 单个卡片，显示设备序列号 | 单个卡片，显示批次号和设备数量 |
| 详情页 | 单设备详情页 | 批次详情页（包含设备列表） |
| 聊天记录 | 无 | 有（批次级别） |
| 签字凭证 | 无 | 有（批次级别） |
| 适用场景 | 单台设备故障 | 同一项目多台设备故障 |

## 实际使用示例

### 场景：广州分公司2台通用电源报修

#### 第1步：添加设备

1. 点击"添加设备"按钮
2. 填写第1台设备信息（N77E1406）
3. 再次点击"添加设备"
4. 填写第2台设备信息（N77I0963）

**此时界面变化：**
- ✅ 顶部出现蓝色"批次工单模式"提示卡片
- ✅ 设备信息卡片标题旁边显示"批次工单 (2台)"徽章
- ✅ 提交按钮文案变为"提交批次工单 (2台设备)"

#### 第2步：填写共享信息

- 项目地点：广州分公司-前台
- 联系人：王一
- 联系电话：13603050631
- 快递公司：顺丰速运
- 快递单号：sf41565156
- 寄件地址：（详细地址）

**重点：** 这些信息只需要填写一次，所有设备共享！

#### 第3步：提交

点击"提交批次工单 (2台设备)"按钮

**提交成功提示：**
```
✅ 批次工单创建成功！

批次号：WO2602249788
设备数量：2台

这些设备已关联到同一个批次工单中，可以统一管理。
```

#### 第4步：查看

返回工单列表，会看到：
- 一个批次工单卡片（WO2602249788）
- 显示"2台设备"
- 点击进入批次详情页
- 可以查看所有设备、聊天记录、签字凭证

## 技术实现

### 数据结构

**前端状态：**
```typescript
const [deviceInputs, setDeviceInputs] = useState<DeviceInput[]>([
  {
    id: "device-1",
    category: "开天配件",
    subCategory: "通用电源",
    modelSelected: "NC100-1M",
    serialNumber: "N77E1406",
    faultDescription: "有问题",
    // ...
  },
  {
    id: "device-2",
    category: "开天配件",
    subCategory: "通用电源",
    modelSelected: "NC100-1M",
    serialNumber: "N77I0963",
    faultDescription: "有问题",
    // ...
  }
]);
```

**API请求：**
```typescript
const batchRequest = {
  customerInfo: { /* 客户信息 */ },
  items: deviceInputs.map(device => ({
    serialNumber: device.serialNumber,
    category: device.category,
    subCategory: device.subCategory,
    modelSelected: device.modelSelected,
    faultDescription: device.faultDescription,
    // ...
  })),
  shipment: { /* 快递信息 */ },
  project: { /* 项目信息 */ }
};

await fetch("/api/tickets/batch", {
  method: "POST",
  body: JSON.stringify(batchRequest)
});
```

**数据库：**
- 为所有设备生成相同的 `BatchId`
- 每个设备单独一条记录
- 通过 `BatchId` 关联

### 前端分组逻辑

工单列表加载后，自动按 `BatchId` 分组：

```typescript
const batchMap = new Map<string, any[]>();

tasks.forEach(task => {
  if (task.batchId && task.batchId.trim() !== "") {
    if (!batchMap.has(task.batchId)) {
      batchMap.set(task.batchId, []);
    }
    batchMap.get(task.batchId)!.push(task);
  } else {
    individualTasks.push(task);
  }
});

// 将批次工单合并为单个卡片
batchMap.forEach((devices, batchId) => {
  groupedTasks.push({
    id: batchId,
    isBatch: true,
    batchId: batchId,
    deviceCount: devices.length,
    devices: devices,
    // ... 其他信息从第一个设备提取
  });
});
```

## 修改的文件

| 文件 | 修改内容 | 影响范围 |
|-----|---------|---------|
| `components/repair-form.tsx` | 添加批次工单提示卡片 | 表单顶部 |
| `components/repair-form.tsx` | 优化设备信息卡片标题 | 设备信息卡片 |
| `components/repair-form.tsx` | 添加卡片说明文字 | 设备信息卡片 |
| `components/repair-form.tsx` | 优化数量选择器 | 数量选择区域（已有） |
| `components/repair-form.tsx` | 优化提交按钮文案 | 提交按钮 |
| `components/repair-form.tsx` | 优化成功提示消息 | 提交成功后 |

## 测试验证

### 单设备工单

- ✅ 只添加1个设备
- ✅ 不显示批次工单提示
- ✅ 按钮文案："提交工单"
- ✅ 提交后创建单个工单（无BatchId）

### 批次工单（2台设备）

- ✅ 添加2个设备
- ✅ 顶部显示蓝色批次工单提示卡片
- ✅ 设备信息卡片显示"批次工单 (2台)"徽章
- ✅ 按钮文案："提交批次工单 (2台设备)"
- ✅ 提交后生成批次号（例如：WO2602249788）
- ✅ 成功提示包含批次号和设备数量

### 批次工单（5台设备）

- ✅ 添加5个设备
- ✅ 所有批次工单提示正确显示"5台"
- ✅ 提交成功
- ✅ 工单列表正确显示为1个批次工单卡片
- ✅ 点击进入批次详情页，显示5个设备
- ✅ 流程时间线正确显示
- ✅ 聊天和签字凭证功能正常

## 相关文档

- [REPAIR_STATUS_TIMELINE.md](./REPAIR_STATUS_TIMELINE.md) - 工单流程时间线
- [BATCH_NAVIGATION_FIX.md](./BATCH_NAVIGATION_FIX.md) - 批次工单导航优化
- [DIALOG_MODE_OPTIMIZATION.md](./DIALOG_MODE_OPTIMIZATION.md) - 对话框模式优化

---

**优化时间**: 2026-02-25  
**版本**: v1.3.1  
**状态**: ✅ 已完成
