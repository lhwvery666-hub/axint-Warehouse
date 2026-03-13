# 保修流程完整说明

## 📋 业务流程概览

```
现场报告 → 仓库收货 → 填写出厂日期 → 自动判断保修
                                        ↓
                        ┌───────────────┴───────────────┐
                        ↓                               ↓
                    【保内】                          【过保】
                        ↓                               ↓
                ┌───────┴────────┐              生成维修报告
                ↓                ↓                      ↓
            可维修          需更换/修不了        发送给现场人员
                ↓                ↓                      ↓
            直接维修          直接结束          客户签字确认
                ↓                                      ↓
            商务确认                          ┌────────┴────────┐
                ↓                             ↓                 ↓
            仓库寄出                      同意维修           不同意维修
                ↓                             ↓                 ↓
              结束                        收款确认          是否回寄？
                                              ↓             ↓      ↓
                                          开始维修        回寄   入库报废
                                              ↓
                                          继续流程
```

## 🔄 详细流程步骤

### 1️⃣ 现场报告阶段
**角色：现场报告人员**

- 填写工单信息：
  - 工单号（同一批次产品共享）
  - 产品名称（客户型号）
  - 型号
  - 序列号（可为空）
  - 数量（无序列号时必填）
  - 故障描述
  - 项目信息、联系方式等

**状态：** `Created` → `Warehouse_Received`

---

### 2️⃣ 仓库收货阶段
**角色：仓库管理员**

**操作：**
1. 确认收货
2. 填写出厂日期（ManufactureDate）
3. 系统自动计算保修状态

**API：** `POST /api/tickets/[id]/set-manufacture-date`

```json
{
  "manufactureDate": "2023-01-15",
  "warrantyPeriodMonths": 12
}
```

**自动判断：**
- 出厂日期 + 保修期 ≥ 当前日期 → **保内**
- 出厂日期 + 保修期 < 当前日期 → **过保**

**状态变化：**
- 保内：`Warehouse_Received` → `In_Warranty_Repair`
- 过保：`Warehouse_Received` → `Out_Warranty_Report`

---

### 3️⃣ 保内流程

#### 3.1 保内可维修
**角色：维修工程师**

**操作：**
- 直接维修
- 填写维修记录

**状态：** `In_Warranty_Repair` → `Admin_Review`

#### 3.2 保内需更换/修不了
**操作：**
- 标记为需更换或无法维修
- 直接结束流程

**状态：** `In_Warranty_Replace` → `Completed` 或 `Unrepairable`

#### 3.3 商务确认
**角色：商务人员**

**操作：**
- 确认维修完成
- 审核费用（保内免费）

**状态：** `Admin_Review` → `Pending_Shipment`

#### 3.4 仓库寄出
**角色：仓库管理员**

**操作：**
- 填写快递信息
- 寄出产品

**状态：** `Pending_Shipment` → `Completed`

---

### 4️⃣ 过保流程

#### 4.1 生成维修报告
**角色：维修工程师**

**操作：**
1. 检测故障
2. 填写维修报告内容：
   - 故障点
   - 维修结果（可维修/需更换/无法维修）
   - 维修费用
   - 供应商信息（如需返厂）

**API：** `POST /api/tickets/[id]/generate-repair-report`

```json
{
  "repairResult": "Repaired",
  "faultPoint": "电源模块损坏",
  "repairCost": 500,
  "repairNotes": "需更换电源模块"
}
```

**状态：** `Out_Warranty_Report` → `Customer_Confirm`

#### 4.2 现场人员确认
**角色：现场报告人员**

**操作：**
1. 打印维修报告
2. 客户签字
3. 提交确认结果

**API：** `POST /api/tickets/[id]/customer-confirm`

```json
{
  "confirmation": "Agreed",  // Agreed/Rejected
  "needReturnShip": true,    // 拒修时填写
  "customerSignature": "/uploads/signature.jpg"
}
```

**状态变化：**

##### 4.2.1 同意维修
**状态：** `Customer_Confirm` → `Pending_Payment`

**后续流程：**
1. 商务确认收款
2. 开始维修
3. 维修完成 → 商务审核 → 仓库寄出

##### 4.2.2 拒绝维修 - 需要回寄
**状态：** `Customer_Confirm` → `Return_Unrepaired`

**后续流程：**
1. 仓库安排回寄
2. 填写快递信息
3. 结束

##### 4.2.3 拒绝维修 - 不回寄
**状态：** `Customer_Confirm` → `Rejected_No_Return`

**后续流程：**
1. 产品入库待报废区
2. 记录入库位置
3. 结束

---

## 📊 Excel导出说明

### 导出规则
1. **按序列号分行**：每个序列号单独一行
2. **无序列号产品**：使用数量字段，单独一行
3. **工单号相同**：同一批次报修的产品共享工单号

### 示例

**原始数据：**
| 工单号 | 产品名称 | 序列号 | 数量 |
|--------|---------|--------|------|
| WO001  | 开关    | (空)   | 10   |
| WO002  | 传感器  | SN001,SN002,SN003 | 3 |

**导出结果：**
| 工单号 | 产品名称 | 序列号 | 数量 |
|--------|---------|--------|------|
| WO001  | 开关    |        | 10   |
| WO002  | 传感器  | SN001  | 1    |
| WO002  | 传感器  | SN002  | 1    |
| WO002  | 传感器  | SN003  | 1    |

### API调用
```bash
GET /api/tickets/export-excel?startDate=2024-01-01&endDate=2024-12-31
```

---

## 🔧 数据库字段说明

### 保修相关字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| ManufactureDate | DATETIME | 出厂日期 |
| WarrantyStatus | NVARCHAR(50) | 保修状态（InWarranty/OutOfWarranty/Unknown） |
| WarrantyPeriodMonths | INT | 保修期（月），默认12 |
| IsWarrantyChecked | BIT | 是否已检查保修状态 |

### 维修报告字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| RepairReportGenerated | BIT | 是否已生成维修报告 |
| RepairReportDate | DATETIME | 维修报告生成日期 |
| RepairReportContent | NVARCHAR(MAX) | 维修报告内容 |
| RepairResult | NVARCHAR(50) | 维修结果 |

### 客户确认字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| CustomerConfirmation | NVARCHAR(50) | 客户确认（Agreed/Rejected/Pending） |
| CustomerConfirmDate | DATETIME | 客户确认日期 |
| CustomerSignature | NVARCHAR(500) | 客户签字图片路径 |
| NeedReturnShip | BIT | 是否需要回寄 |

### 收费字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| IsPaymentReceived | BIT | 是否已收款 |
| PaymentDate | DATETIME | 收款日期 |
| PaymentAmount | DECIMAL(18,2) | 实际收款金额 |

---

## 🚀 快速开始

### 1. 运行数据库升级脚本
```bash
npm run add-warranty-fields
```

### 2. 测试保修流程

#### 步骤1：仓库填写出厂日期
```bash
POST /api/tickets/123/set-manufacture-date
{
  "manufactureDate": "2023-01-15",
  "warrantyPeriodMonths": 12
}
```

#### 步骤2：如果过保，生成维修报告
```bash
POST /api/tickets/123/generate-repair-report
{
  "repairResult": "Repaired",
  "faultPoint": "电源模块损坏",
  "repairCost": 500
}
```

#### 步骤3：现场人员提交客户确认
```bash
POST /api/tickets/123/customer-confirm
{
  "confirmation": "Agreed",
  "customerSignature": "/uploads/signature.jpg"
}
```

### 3. 导出Excel
```bash
GET /api/tickets/export-excel?startDate=2024-01-01
```

---

## 📝 注意事项

1. **出厂日期必填**：仓库管理员必须填写出厂日期才能继续流程
2. **保修期默认12个月**：可以根据产品类型调整
3. **维修报告必须打印签字**：过保产品需要客户签字确认
4. **拒修必须选择是否回寄**：影响后续流程
5. **Excel导出按序列号分行**：便于统计和追踪

---

## 🔗 相关API

| API | 方法 | 说明 |
|-----|------|------|
| `/api/tickets/[id]/set-manufacture-date` | POST | 设置出厂日期并判断保修 |
| `/api/tickets/[id]/generate-repair-report` | POST | 生成维修报告 |
| `/api/tickets/[id]/customer-confirm` | POST | 客户确认维修 |
| `/api/tickets/export-excel` | GET | 导出Excel |

---

## 📞 技术支持

如有问题，请查看：
- `lib/enums.ts` - 状态枚举定义
- `scripts/add-warranty-fields.ts` - 数据库升级脚本
- `SYSTEM_CHECKLIST.md` - 系统检查清单
