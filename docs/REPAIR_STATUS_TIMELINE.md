# 维修工单流程时间线

## 功能概述

新增了一个可视化的流程时间线组件，类似大学申请流程展示，让用户能直观地看到维修工单当前处于哪个阶段。

## 设计灵感

参考了大学申请流程的可视化设计：
- 水平排列的步骤节点
- 用圆圈表示每个阶段
- 连接线显示进度
- 当前步骤高亮显示
- 已完成步骤显示勾选标记

## 流程阶段

维修工单的5个主要阶段：

| 阶段 | 状态值 | 说明 | 负责角色 |
|-----|--------|------|---------|
| 1. 工单已创建 | Created / Pending | 现场人员已提交 | 现场人员 |
| 2. 维修中 | In_Repair | 维修人员处理中 | 维修人员 |
| 3. 待现场确认 | Pending_Reporter_Confirm | 等待现场确认 | 现场人员 |
| 4. 商务处理 | Admin_Review | 商务审核中 | 管理员/商务 |
| 5. 已完成 | Completed | 流程结束 | - |

## 组件特性

### 1. 自动状态映射

组件会自动将各种状态映射到主要流程阶段：

```typescript
'created' → 工单已创建
'pending' → 工单已创建
'in_repair' → 维修中
'in_warranty_repair' → 维修中
'out_warranty_repair' → 维修中
'pending_reporter_confirm' → 待现场确认
'admin_review' → 商务处理
'pending_shipment' → 商务处理
'completed' → 已完成
```

### 2. 响应式设计

- **桌面端**: 水平排列，连接线在顶部
- **移动端**: 垂直排列，连接线在左侧
- 自动适配不同屏幕尺寸

### 3. 视觉效果

**已完成步骤**:
- 实心圆圈，主题色背景
- 白色勾选图标
- 文字显示主题色
- 带阴影效果

**当前步骤**:
- 实心圆圈，主题色背景
- 内部小圆点
- 外围光环效果 (ring)
- 放大显示 (scale-110)
- 文字加粗，主题色

**未开始步骤**:
- 空心圆圈，灰色背景
- 内部小圆点
- 文字灰色
- 无特殊效果

### 4. 动画效果

- 状态变化时的平滑过渡 (300ms)
- 进度线的动画填充 (500ms)
- 节点缩放动画

## 使用方式

### 基本用法

```typescript
import { RepairStatusTimeline } from "@/components/repair-status-timeline";
import { TicketStatus } from "@/lib/enums";

<RepairStatusTimeline currentStatus={TicketStatus.IN_REPAIR} />
```

### 在批次详情页使用

```typescript
<Card>
  <CardContent className="pt-6">
    <RepairStatusTimeline currentStatus={batchInfo.status || "Created"} />
  </CardContent>
</Card>
```

### 在弹窗中使用（现场人员页面）

```typescript
<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
  <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>维修工单详情</DialogTitle>
    </DialogHeader>
    
    {/* 流程时间线 */}
    <div className="px-2">
      <RepairStatusTimeline currentStatus={selectedTask.status || "Created"} />
    </div>
    
    {/* 其他内容 */}
  </DialogContent>
</Dialog>
```

### 在单个工单页使用

```typescript
<RepairStatusTimeline 
  currentStatus={ticket.status} 
  className="mb-6"
/>
```

## 实现文件

### 新增文件

1. **`components/repair-status-timeline.tsx`**
   - 主组件文件
   - 包含完整的UI和逻辑

### 修改文件

1. **`components/batch-work-order-detail.tsx`**
   - 在页面顶部添加时间线组件
   - 导入 `RepairStatusTimeline` 和 `TicketStatus`

2. **`app/api/tickets/batch-devices/[batchId]/route.ts`**
   - 在 `batchInfo` 中添加 `status` 字段
   - 从数据库查询结果中提取状态

3. **`app/report/page.tsx`** (现场人员页面)
   - 在工单详情弹窗中添加时间线组件
   - 调整弹窗大小以容纳时间线
   - 添加滚动支持

## 代码示例

### 组件接口

```typescript
interface RepairStatusTimelineProps {
  currentStatus: TicketStatus | string;  // 当前状态
  className?: string;                     // 自定义样式
}
```

### 流程步骤定义

```typescript
const steps: TimelineStep[] = [
  {
    key: TicketStatus.CREATED,
    label: "工单已创建",
    description: "现场人员已提交"
  },
  {
    key: TicketStatus.IN_REPAIR,
    label: "维修中",
    description: "维修人员处理中"
  },
  {
    key: TicketStatus.PENDING_REPORTER_CONFIRM,
    label: "待现场确认",
    description: "等待现场确认"
  },
  {
    key: TicketStatus.ADMIN_REVIEW,
    label: "商务处理",
    description: "商务审核中"
  },
  {
    key: TicketStatus.COMPLETED,
    label: "已完成",
    description: "流程结束"
  },
];
```

## 样式定制

### Tailwind CSS 类

组件使用 Tailwind CSS 进行样式设计，主要类包括：

**节点圆圈**:
```typescript
"w-10 h-10 md:w-12 md:h-12"           // 尺寸
"rounded-full"                         // 圆形
"bg-primary"                           // 背景色
"ring-4 ring-primary/20"              // 光环效果
"shadow-lg shadow-primary/40"         // 阴影
"scale-110"                           // 放大
```

**连接线**:
```typescript
"h-0.5 bg-muted"                      // 基础线条
"bg-primary transition-all"           // 进度线条
```

**文字**:
```typescript
"text-primary font-bold"              // 当前步骤
"text-primary"                        // 已完成步骤
"text-muted-foreground"               // 未开始步骤
```

### 自定义主题色

如果需要自定义颜色，可以修改 Tailwind 配置中的 `primary` 颜色，或直接修改组件中的颜色类：

```typescript
// 将 bg-primary 改为 bg-blue-500
// 将 text-primary 改为 text-blue-600
// 将 ring-primary/20 改为 ring-blue-500/20
```

## 扩展功能

### 1. 添加更多阶段

如果需要添加更多流程阶段，只需在 `steps` 数组中添加新步骤：

```typescript
{
  key: TicketStatus.QUALITY_CHECK,
  label: "质量检查",
  description: "质检部门审核"
},
```

### 2. 添加时间信息

可以扩展组件显示每个阶段的完成时间：

```typescript
interface TimelineStep {
  key: TicketStatus;
  label: string;
  description?: string;
  timestamp?: string;  // 新增：完成时间
}
```

### 3. 添加点击交互

可以添加点击事件查看各阶段详情：

```typescript
<div
  onClick={() => onStepClick(step)}
  className="cursor-pointer hover:opacity-80"
>
  {/* 节点内容 */}
</div>
```

### 4. 支持分支流程

对于有分支的流程（如：维修/报废/退回），可以创建分支版本：

```typescript
// 主流程
const mainSteps = [...];

// 分支流程（报废）
const scrapBranch = [
  { key: TicketStatus.CREATED, ... },
  { key: TicketStatus.IN_REPAIR, ... },
  { key: TicketStatus.SCRAPPED, label: "已报废", ... },
];
```

## 用户体验提升

### 优点

1. **直观可视化**: 用户一眼就能看出工单进度
2. **减少困惑**: 明确告知当前阶段和下一步
3. **专业感**: 提升系统的专业形象
4. **易于理解**: 类似常见的流程图，学习成本低

### 适用场景

- ✅ 批次工单详情页顶部
- ✅ 现场人员工单详情弹窗
- 单个设备详情页
- Dashboard 工单卡片（简化版）
- 打印报告页面
- 工单历史记录页面

## 测试要点

### 功能测试

- ✅ 不同状态正确映射到对应阶段
- ✅ 当前步骤高亮显示
- ✅ 已完成步骤显示勾选
- ✅ 未开始步骤显示灰色
- ✅ 进度线正确填充

### 响应式测试

- ✅ 桌面端横向显示正常
- ✅ 移动端纵向显示正常
- ✅ 不同屏幕尺寸适配正常
- ✅ 文字不会溢出或截断

### 视觉测试

- ✅ 颜色对比度符合可访问性标准
- ✅ 动画流畅不卡顿
- ✅ 暗色模式下显示正常
- ✅ 打印时样式正常

## 相关文档

- [DIALOG_MODE_OPTIMIZATION.md](./DIALOG_MODE_OPTIMIZATION.md) - 对话框模式优化
- [BATCH_NAVIGATION_FIX.md](./BATCH_NAVIGATION_FIX.md) - 批次工单导航修复
- [WORKFLOW_OPTIMIZATION.md](./REPAIR_WORKFLOW_OPTIMIZATION.md) - 工作流程优化

---

**创建时间**: 2026-02-25  
**版本**: v1.3.0  
**状态**: ✅ 已完成
