# 完整工作流程系统 - 更新摘要 v2.0

## 概述

本次更新实现了一个完整的9步工作流程系统，涉及4个角色（现场人员、仓库管理员、维修人员、商务人员），每个环节都有明确的责任人和专用操作界面。

---

## 核心改进

### 1. 工作流程重构 🔄

#### 旧流程（5步）
```
创建 → 维修 → 现场确认 → 商务处理 → 完成
```

#### 新流程（9步）
```
创建 → 仓库确认 → 仓库已确认 → 维修检查 → 现场签字 
    → 维修进行 → 商务审核 → 仓库发货 → 完成
```

**改进点**：
- ✅ 明确了仓库管理员的前置确认环节
- ✅ 区分了"维修检查"和"实际维修"两个阶段
- ✅ 商务审核独立出来，专门负责收款和开票
- ✅ 仓库发货作为最后环节，可选发回或入库

---

### 2. 新增状态定义 📊

| 状态代码 | 中文名称 | 说明 |
|---------|---------|-----|
| `Warehouse_Confirming` | 待仓库确认 | 等待仓库确认设备并填写出厂日期 |
| `Warehouse_Confirmed` | 仓库已确认 | 出厂日期已填写，待维修检查 |
| `Technician_Repairing` | 维修进行中 | 收到签字，维修人员正在维修 |
| `Business_Review` | 待商务审核 | 等待商务确认收款和开票 |
| `Warehouse_Shipping` | 待仓库发货 | 等待仓库出库发回或入库 |

**向后兼容**：
- `Warehouse_Received` → `Warehouse_Confirming`
- `Admin_Review` → `Business_Review`
- `Pending_Shipment` → `Warehouse_Shipping`

---

### 3. 新增界面组件 🎨

#### 仓库管理员界面

**1. 待确认批次列表**
- 文件：`app/warehouse/dashboard/page.tsx`
- 功能：显示所有待确认的批次工单
- 入口：`/warehouse/dashboard`

**2. 批次确认界面**
- 文件：`components/warehouse-batch-confirm.tsx`
- 功能：
  - 显示批次基础信息和设备清单
  - 为每台设备填写出厂日期
  - 系统自动计算保修状态
  - 确认后状态变为 `Warehouse_Confirmed`

**3. 批次发货界面**
- 文件：`components/warehouse-batch-shipping.tsx`
- 功能：
  - 选择发货方式：发回客户 或 产品入库
  - 填写快递信息（如果发回客户）
  - 完成后状态变为 `Completed`

---

#### 商务人员界面

**1. 待审核批次列表**
- 文件：`app/business/page.tsx`
- 功能：显示所有待商务审核的批次工单
- 入口：`/business` → 待审核批次标签页

**2. 商务审核界面**
- 文件：`components/business-batch-review.tsx`
- 功能：
  - 确认是否收费
  - 填写维修费用和客户名称
  - 确认收款状态（收费项目必填）
  - 确认开票状态（选填）
  - 完成后状态变为 `Warehouse_Shipping`

---

#### 维修人员界面

**优化批次详情页**
- 文件：`components/batch-work-order-detail.tsx`
- 新增功能：
  - ✅ 显示设备出厂日期列
  - ✅ 显示保修状态列（保内/过保）
  - ✅ 仓库未确认时，禁用"编辑维修报告"按钮
  - ✅ 维修进行中时，显示"完成维修"按钮
  - ✅ 根据不同状态显示不同的操作指引
  - ✅ 完成维修后，状态自动流转至商务审核

---

### 4. 新增API端点 🔌

| API路径 | 方法 | 功能 |
|--------|-----|------|
| `/api/tickets/warehouse-pending-batches` | GET | 获取待确认批次列表 |
| `/api/tickets/warehouse-confirm-batch/[batchId]` | POST | 确认批次并填写出厂日期 |
| `/api/tickets/warehouse-shipping-batches` | GET | 获取待发货批次列表 |
| `/api/tickets/warehouse-shipping-batch/[batchId]` | POST | 完成发货（发回或入库） |
| `/api/tickets/business-pending-batches` | GET | 获取待商务审核批次列表 |
| `/api/tickets/business-confirm-batch/[batchId]` | POST | 完成商务审核 |
| `/api/tickets/complete-repair-batch/[batchId]` | POST | 维修人员完成维修 |

---

### 5. 时间线组件优化 📈

**文件**: `components/repair-status-timeline.tsx`

**改进**：
- ✅ 从5步扩展到9步，更清晰地展示完整流程
- ✅ 桌面端：横向滚动，紧凑显示
- ✅ 移动端：垂直布局，适配小屏幕
- ✅ 实时高亮当前步骤
- ✅ 动画效果，提升用户体验

**步骤显示**：
```
1. 工单创建 → 2. 仓库确认 → 3. 待维修检查 → 4. 维修检查 
→ 5. 现场签字 → 6. 维修中 → 7. 商务审核 → 8. 仓库发货 → 9. 已完成
```

---

### 6. 状态流转逻辑优化 ⚡

#### 创建工单
```
现场人员提交 → 系统创建 → 状态设为 Warehouse_Confirming
```

#### 仓库确认
```
仓库管理员填写出厂日期 → API自动计算保修状态 → 状态变为 Warehouse_Confirmed
```

#### 维修检查
```
维修人员填写报告 → 保存完成 → 状态变为 Pending_Reporter_Confirm
```

#### 现场签字
```
现场人员上传签字照片 → 立即变为 Technician_Repairing
```

#### 完成维修
```
维修人员点击完成 → 状态变为 Business_Review
```

#### 商务审核
```
商务人员确认收款 → 状态变为 Warehouse_Shipping
```

#### 仓库发货
```
仓库管理员发货 → 状态变为 Completed
```

---

## 数据库变化

### 新增字段（12个）

```sql
-- 出厂日期和保修
ManufactureDate DATETIME NULL
WarrantyStatus VARCHAR(50) NULL

-- 仓库确认
WarehouseConfirmedAt DATETIME NULL
WarehouseConfirmedBy VARCHAR(100) NULL

-- 维修完成
TechnicianCompletedAt DATETIME NULL
TechnicianCompletedBy VARCHAR(100) NULL

-- 商务审核
BusinessReviewedAt DATETIME NULL
BusinessReviewedBy VARCHAR(100) NULL

-- 仓库发货
ShippingType VARCHAR(50) NULL
WarehouseShippedAt DATETIME NULL
WarehouseShippedBy VARCHAR(100) NULL

-- 现场确认
ReporterConfirmedAt DATETIME NULL
```

**迁移脚本**: 参见 `DATABASE_SCHEMA_UPDATE.md`

---

## 文件清单

### 新增文件（10个）

#### 组件
1. `components/warehouse-batch-confirm.tsx` - 仓库批次确认组件
2. `components/business-batch-review.tsx` - 商务审核组件
3. `components/warehouse-batch-shipping.tsx` - 仓库发货组件

#### API
4. `app/api/tickets/warehouse-pending-batches/route.ts` - 待确认批次列表
5. `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts` - 确认批次
6. `app/api/tickets/warehouse-shipping-batches/route.ts` - 待发货批次列表
7. `app/api/tickets/warehouse-shipping-batch/[batchId]/route.ts` - 完成发货
8. `app/api/tickets/business-pending-batches/route.ts` - 待审核批次列表
9. `app/api/tickets/business-confirm-batch/[batchId]/route.ts` - 商务审核
10. `app/api/tickets/complete-repair-batch/[batchId]/route.ts` - 完成维修

#### 文档
11. `docs/COMPLETE_WORKFLOW_SYSTEM.md` - 完整工作流程文档
12. `docs/WORKFLOW_TEST_GUIDE.md` - 测试指南
13. `docs/USER_ROLE_GUIDE.md` - 用户角色操作指南
14. `docs/DATABASE_SCHEMA_UPDATE.md` - 数据库更新脚本
15. `docs/UPDATE_SUMMARY_V2.md` - 本文件

---

### 修改文件（7个）

1. `lib/enums.ts` - 添加新状态枚举和标签
2. `components/repair-status-timeline.tsx` - 扩展为9步时间线
3. `components/batch-work-order-detail.tsx` - 添加状态提示和操作按钮
4. `app/warehouse/dashboard/page.tsx` - 添加待确认和待发货批次列表
5. `app/business/page.tsx` - 添加待审核批次列表
6. `app/api/tickets/batch/route.ts` - 修改初始状态为 Warehouse_Confirming
7. `app/api/tickets/batch-devices/[batchId]/route.ts` - 添加出厂日期和保修状态
8. `app/api/tickets/batch-repair-report/[batchId]/route.ts` - 状态流转优化
9. `app/api/tickets/reporter-confirm/[batchId]/route.ts` - 上传签字后状态流转

---

## 用户体验提升

### 1. 状态可视化

每个批次详情页都会显示：
- ✅ 9步流程时间线，实时高亮当前步骤
- ✅ 根据状态显示不同颜色的提示框
- ✅ 明确告知当前应该由谁操作

### 2. 权限控制

不同角色看到不同的按钮和操作：
- ✅ 仓库未确认时，维修人员无法编辑报告
- ✅ 收费项目未收款时，商务无法审核通过
- ✅ 只有现场人员可以申请取消批次
- ✅ 每个角色只能执行自己职责范围内的操作

### 3. 操作指引

每个状态都有清晰的操作指引：
- ✅ 橙色提示框：等待中
- ✅ 蓝色提示框：可以操作
- ✅ 绿色提示框：已完成
- ✅ 紫色提示框：商务相关
- ✅ 红色按钮：取消操作

---

## 角色工作台

### 仓库管理员工作台

**路径**: `/warehouse/dashboard`

**标签页**：
1. **待确认批次** - 显示所有 `Warehouse_Confirming` 状态的批次
2. **待发货批次** - 显示所有 `Warehouse_Shipping` 状态的批次
3. **数据库管理** - 管理设备数据库

---

### 商务人员工作台

**路径**: `/business`

**标签页**：
1. **数据总览** - 显示统计数据和图表
2. **待审核批次** - 显示所有 `Business_Review` 状态的批次

---

### 维修人员工作台

**路径**: `/repairs` 或 `/batch/[id]`

**功能**：
- 查看批次详情
- 查看出厂日期和保修状态
- 编辑维修报告（仓库确认后）
- 查看签字凭证
- 完成维修

---

### 现场人员工作台

**路径**: `/report`

**功能**：
- 创建批次工单
- 查看工单详情（弹窗）
- 签字回传
- 申请取消批次

---

## 关键功能特性

### 1. 出厂日期管理 📅

**流程**：
1. 仓库管理员收到设备后，填写每台设备的出厂日期
2. 系统自动计算保修状态（保内/过保）
3. 维修人员查看时可以看到出厂日期和保修状态
4. 保内设备通常免费维修，过保设备需要收费

**计算规则**：
- 出厂日期 + 12个月 ≥ 当前日期 → 保内 ✅
- 出厂日期 + 12个月 < 当前日期 → 过保 ⚠️

---

### 2. 商务审核流程 💰

**收费项目**：
- 必填：维修总费用
- 必填：是否已收款 ✅
- 选填：客户名称
- 选填：是否已开票

**不收费项目**：
- 直接审核通过，无需填写额外信息

**验证规则**：
- 收费项目必须确认收款后才能审核通过
- 未开票会弹出提醒，但允许继续

---

### 3. 仓库发货选择 📦

**两种方式**：

#### 发回客户
- 填写：发货日期、快递单号、发货数量
- 适用：设备已修复，发回给客户
- 结果：工单完成

#### 产品入库
- 无需填写快递信息
- 适用：设备暂不发回，先入库存储
- 结果：工单完成，设备标记为"已入库"

---

### 4. 动态操作按钮 🎯

批次详情页的按钮会根据状态和角色动态显示：

| 状态 | 维修人员 | 现场人员 |
|-----|---------|---------|
| `Warehouse_Confirming` | "编辑报告（等待仓库确认）" [禁用] | "查看报告" |
| `Warehouse_Confirmed` | "编辑维修报告" [可用] | "查看报告" |
| `In_Repair` | "编辑维修报告" | "查看报告" |
| `Pending_Reporter_Confirm` | "打印报告" | "查看报告" + 签字上传 |
| `Technician_Repairing` | "完成维修" [绿色按钮] | "查看报告" |
| 其他状态 | "打印报告" | "查看报告" |

**所有状态**：
- 现场人员都可以看到"申请取消批次工单"按钮（已完成/已取消除外）

---

## 数据流转示例

### 示例：2台通用电源维修（保内免费）

#### 数据变化追踪

| 时间 | 操作人 | 操作 | 状态变化 | 字段变化 |
|-----|-------|------|---------|---------|
| 09:00 | 王一（现场） | 创建批次工单 | `Warehouse_Confirming` | `BatchId=WO2602259788` |
| 10:00 | 张三（仓库） | 确认并填写出厂日期 | `Warehouse_Confirmed` | `ManufactureDate=2024-06-15`<br>`WarrantyStatus=InWarranty`<br>`WarehouseConfirmedBy=张三` |
| 11:00 | 李明（维修） | 填写维修报告 | `Pending_Reporter_Confirm` | `FaultPoint=电源模块损坏`<br>`RepairCost=0` |
| 13:00 | 王一（现场） | 上传签字照片 | `Technician_Repairing` | `SignedReportPhoto=/uploads/...`<br>`ReporterConfirmedAt=2026-02-25 13:00` |
| 14:00 | 李明（维修） | 完成维修 | `Business_Review` | `TechnicianCompletedAt=2026-02-25 14:00`<br>`TechnicianCompletedBy=李明` |
| 16:00 | 赵丽（商务） | 商务审核（不收费） | `Warehouse_Shipping` | `IsChargeable=0`<br>`BusinessReviewedAt=2026-02-25 16:00`<br>`BusinessReviewedBy=赵丽` |
| 09:00<br>次日 | 张三（仓库） | 发回客户 | `Completed` | `ReturnDate=2026-02-26`<br>`ReturnTrackingNum=SF1234567890`<br>`ShippingType=return`<br>`WarehouseShippedBy=张三` |

---

## 技术亮点

### 1. 状态机设计

每个状态都有明确的：
- 前置条件（什么状态可以流转到这个状态）
- 操作权限（哪个角色可以操作）
- 后续状态（完成后流转到哪里）

### 2. 批次原子性

批次中的所有设备：
- ✅ 共享相同的状态
- ✅ 一起流转到下一个环节
- ✅ 统一确认、统一审核、统一发货

### 3. 审计追踪

每个关键操作都记录：
- ✅ 操作时间（`...At` 字段）
- ✅ 操作人（`...By` 字段）
- ✅ 便于追溯和审计

### 4. 保修期自动计算

根据出厂日期和当前日期：
- ✅ 自动计算是否在保修期内
- ✅ 保内设备通常免费维修
- ✅ 过保设备需要收费

---

## 部署清单

### 1. 数据库更新

```bash
# 运行数据库更新脚本
sqlcmd -S your_server -d your_database -i DATABASE_SCHEMA_UPDATE.sql
```

详见：`docs/DATABASE_SCHEMA_UPDATE.md`

---

### 2. 代码部署

```bash
# 1. 拉取代码
git pull origin main

# 2. 安装依赖
npm install

# 3. 构建应用
npm run build

# 4. 启动应用
npm start
```

---

### 3. 测试验证

详见：`docs/WORKFLOW_TEST_GUIDE.md`

**必测项目**：
- [ ] 现场人员创建批次工单
- [ ] 仓库管理员确认并填写出厂日期
- [ ] 维修人员查看出厂日期和保修状态
- [ ] 维修人员编辑维修报告
- [ ] 现场人员签字回传
- [ ] 维修人员完成维修
- [ ] 商务人员审核（收费和不收费）
- [ ] 仓库管理员发货（发回和入库）
- [ ] 时间线正确显示

---

## 兼容性说明

### 向后兼容

旧的状态会自动映射到新状态：
- `Warehouse_Received` → `Warehouse_Confirming`
- `Admin_Review` → `Business_Review`
- `Pending_Shipment` → `Warehouse_Shipping`

### 旧数据处理

已存在的工单（`Completed`状态）：
- ✅ 不受影响，可以正常查看
- ✅ 可以选择性地为旧数据补充出厂日期
- ✅ 保修状态可以根据历史数据推算

---

## 下一步计划

### 短期优化

- [ ] 添加状态变更历史记录功能
- [ ] 添加各角色的待办事项通知
- [ ] 添加批次工单的打印模板优化
- [ ] 添加移动端优化

### 中期功能

- [ ] 添加取消申请的审批界面（商务人员）
- [ ] 添加设备维修历史追踪
- [ ] 添加客户满意度评价
- [ ] 添加维修成本统计分析

### 长期规划

- [ ] 添加自动化提醒（邮件/短信）
- [ ] 添加报表系统
- [ ] 添加KPI考核
- [ ] 添加移动端APP

---

## 相关文档

1. [COMPLETE_WORKFLOW_SYSTEM.md](./COMPLETE_WORKFLOW_SYSTEM.md) - 完整工作流程详细说明
2. [WORKFLOW_TEST_GUIDE.md](./WORKFLOW_TEST_GUIDE.md) - 测试指南
3. [USER_ROLE_GUIDE.md](./USER_ROLE_GUIDE.md) - 各角色操作指南
4. [DATABASE_SCHEMA_UPDATE.md](./DATABASE_SCHEMA_UPDATE.md) - 数据库更新脚本

---

## 联系方式

如有问题，请联系：
- 技术支持：[待填写]
- 产品经理：[待填写]

---

**创建时间**: 2026-02-25  
**版本**: v2.0.0  
**状态**: ✅ 已完成开发，待部署测试
