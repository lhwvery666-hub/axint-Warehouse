# 批次工单分组显示修复

## 📋 问题描述

用户反馈：在"维修工单管理"页面中，批次工单的设备被错误地显示为独立的工单卡片，而不是像首页那样显示为一个批次工单。

### 问题截图对比

**问题（修复前）：**
- 维修工单页面显示：N77E1406、N77I0963 作为两个独立工单
- 用户体验差，无法看出这是同一批次

**正确（修复后）：**
- 维修工单页面显示：WO26... 批次工单，包含 2 台设备
- 与首页仪表板显示一致

## 🔍 根本原因

### 代码对比

#### Dashboard（首页）✅
```typescript
// dashboard.tsx 中有批次分组逻辑
const batchMap = new Map<string, any>();
formattedTasks.forEach((task) => {
  if (task.batchId && task.batchId.trim() !== "") {
    // 批次分组逻辑
  }
});
```

#### RepairPage（维修工单管理）❌ 
```typescript
// repair-page.tsx 缺少批次分组逻辑
const formattedTasks = repairs.map((repair) => ({...}));
setTasks(formattedTasks); // 直接设置，没有分组
```

### 问题分析
- **Dashboard** 实现了批次分组，将同一 `batchId` 的设备合并显示
- **RepairPage** 缺少这个逻辑，导致每个设备都显示为独立工单

## ✅ 修复方案

### 1. 添加批次分组逻辑

在 `repair-page.tsx` 的 `useEffect` 中添加与 Dashboard 相同的批次分组逻辑：

```typescript
// 🔧 批次分组逻辑：将同一batchId的工单合并为一个批次任务
const batchMap = new Map<string, any>();
const individualTasks: any[] = [];

formattedTasks.forEach((task) => {
  if (task.batchId && task.batchId.trim() !== "") {
    if (batchMap.has(task.batchId)) {
      // 已有该批次，添加设备到devices数组
      const batchTask = batchMap.get(task.batchId);
      batchTask.devices.push(task);
      batchTask.deviceCount = batchTask.devices.length;
    } else {
      // 新批次，创建批次任务对象
      batchMap.set(task.batchId, {
        id: task.batchId,
        isBatch: true,
        batchId: task.batchId,
        projectName: task.projectName || "未知项目",
        contactInfo: task.contactInfo || "无联系信息",
        deviceCount: 1,
        devices: [task],
      });
    }
  } else {
    // 没有batchId，作为单独工单处理
    individualTasks.push(task);
  }
});

// 合并批次任务和单独任务
const groupedTasks = [...Array.from(batchMap.values()), ...individualTasks];
setTasks(groupedTasks);
```

### 2. 优化任务卡片显示

区分批次工单和单独工单的显示：

```typescript
{/* 批次工单显示批次信息 */}
{task.isBatch ? (
  <>
    <h3>工单号：{task.batchId}</h3>
    <p>项目：{task.projectName}</p>
    <p>联系人：{task.contactInfo}</p>
    <Badge>{task.deviceCount} 台设备</Badge>
    {/* 显示设备序列号列表 */}
    {task.devices.slice(0, 3).map(device => (
      <Badge>{device.deviceSerialNumber}</Badge>
    ))}
  </>
) : (
  <>
    <h3>工单号：{task.id}</h3>
    <p>序列号：{task.deviceSerialNumber}</p>
    <p>故障：{task.fault}</p>
  </>
)}
```

### 3. 添加批次设备选择流程

点击批次工单时，显示设备选择界面：

```typescript
onClick={() => {
  if (task.isBatch && task.devices && task.devices.length > 0) {
    // 设置批次上下文并切换到批次选择视图
    setCurrentBatchTask(task);
    setView("batchSelect");
  } else {
    handleViewTask(task.id);
  }
}}
```

### 4. 实现批次选择视图

```typescript
{view === "batchSelect" && currentBatchTask && (
  <div>
    <h1>选择要处理的设备</h1>
    <p>工单号：{currentBatchTask.batchId}</p>
    <p>共 {currentBatchTask.devices.length} 个设备</p>
    
    {/* 显示设备列表 */}
    {currentBatchTask.devices.map(device => (
      <Card onClick={() => handleViewTask(device.id)}>
        <Badge>{device.deviceSerialNumber}</Badge>
        <p>{device.deviceName}</p>
        <p>{device.problem}</p>
      </Card>
    ))}
  </div>
)}
```

## 📊 修复结果

### 修复前
```
维修工单管理页面：
├─ N77E1406 (独立工单)
└─ N77I0963 (独立工单)
```

### 修复后
```
维修工单管理页面：
└─ WO26... (批次工单)
   ├─ N77E1406
   └─ N77I0963
```

## 🔧 修改的文件

```
✅ components/repair-page.tsx
   - 添加批次分组逻辑（与 dashboard.tsx 保持一致）
   - 优化任务卡片显示（区分批次和单独工单）
   - 添加批次选择状态管理
   - 实现批次设备选择视图
   - 添加 Package 图标导入
   - 优化返回逻辑（支持批次上下文）
```

## 📁 代码改动统计

- **新增代码**: ~80 行
- **修改代码**: ~50 行
- **功能增强**: 
  - ✅ 批次分组显示
  - ✅ 批次设备选择
  - ✅ 批次信息展示
  - ✅ 设备序列号预览

## 🧪 测试验证

### 测试步骤
1. **创建批次工单**
   - 创建包含多个设备的批次工单
   - 例如：WO26... 包含 N77E1406、N77I0963

2. **查看首页**
   - 确认首页显示为批次工单
   - 显示"2 台设备"

3. **查看维修工单管理页面**
   - 确认显示为批次工单（不是独立设备）
   - 显示批次号、项目、设备数量
   - 显示设备序列号预览

4. **点击批次工单**
   - 进入批次设备选择页面
   - 显示所有设备列表

5. **点击单个设备**
   - 进入设备详情页
   - 可以正常查看和编辑

6. **返回操作**
   - 从设备详情返回批次设备选择
   - 从批次设备选择返回工单列表

### 预期结果
- ✅ 维修工单页面与首页显示一致
- ✅ 批次工单正确分组
- ✅ 设备选择流程正常
- ✅ 返回逻辑正确

## 🎯 用户体验改进

### 改进前
- ❌ 无法识别批次工单
- ❌ 设备分散显示
- ❌ 需要多次点击才能查看同批次设备

### 改进后
- ✅ 一目了然看出批次工单
- ✅ 设备集中管理
- ✅ 一次点击查看所有批次设备
- ✅ 显示项目和联系信息
- ✅ 与首页体验一致

## 📝 注意事项

1. **批次ID必填**
   - 只有填写了 `batchId` 的工单才会被分组
   - 没有 `batchId` 的工单仍然单独显示

2. **批次信息来源**
   - 项目名称：`projectName` 或 `projectLocation`
   - 联系信息：`contactInfo`
   - 设备数量：自动计算

3. **状态筛选**
   - 批次工单的状态取第一个设备的状态
   - 筛选时按批次整体筛选

4. **搜索功能**
   - 可以搜索批次号（batchId）
   - 可以搜索设备序列号
   - 可以搜索故障描述

## 🔮 未来优化建议

1. **批次状态聚合**
   - 如果批次中有多个不同状态，显示"混合状态"
   - 例如：部分维修中，部分已完成

2. **批次进度显示**
   - 显示批次整体维修进度
   - 例如：2/3 已完成

3. **批次操作**
   - 支持批量操作同批次设备
   - 例如：批量开始维修、批量完成

4. **批次报告**
   - 生成批次维修汇总报告
   - 包含所有设备的维修情况

---

**修复完成时间**: 2026-02-24
**修复人员**: AI Assistant (Arch)
