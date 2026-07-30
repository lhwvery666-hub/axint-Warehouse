# 数据库清理脚本使用指南

## 📋 概述

提供了两个数据库清理脚本，用于测试前清空工单数据。

## 🛠️ 脚本说明

### 1. `clear-tickets-safe.ts` （推荐）

**安全版清理脚本** - 只清除工单数据，保留用户和基础数据。

#### 清除的内容
- ✅ 工单记录 (`Repair_Tickets`)
- ✅ 工单历史 (`Repair_Ticket_History`)
- ✅ 工单聊天消息 (`TicketMessage`)
- ✅ 客户历史记录 (`Customer_History`)

#### 保留的内容
- ✅ 用户账号 (`Users`)
- ✅ 设备库存 (`Device_Inventory`)
- ✅ 产品目录 (`Product_Catalog`)
- ✅ 项目和客户信息 (`Project`, `Customer`, `Batch`)
- ✅ 系统配置 (`System_Config`)

#### 使用方法
```bash
cd "D:\MY app\axiom-repair"
npx tsx scripts/clear-tickets-safe.ts
```

#### 特点
- ✅ 无需确认，直接执行
- ✅ 保留用户登录信息
- ✅ 适合日常测试使用

---

### 2. `clear-all-tickets.ts`

**完全清理脚本** - 清除所有工单相关数据，需要手动确认。

#### 清除的内容
与安全版相同，但会要求用户输入 `YES` 确认。

#### 使用方法
```bash
cd "D:\MY app\axiom-repair"
npx tsx scripts/clear-all-tickets.ts
```

当提示确认时，输入 `YES`（全大写）：
```
⚠️  确定要清除所有工单数据吗？此操作不可逆！(输入 YES 确认): YES
```

#### 特点
- ⚠️ 需要手动确认
- ⚠️ 防止误操作
- ✅ 适合重要环境使用

---

## 📊 清理结果示例

```
🧹 开始清理工单数据（安全模式）...

ℹ️  此脚本将清除：
  ✓ 工单记录
  ✓ 工单历史
  ✓ 工单聊天消息
  ✓ 客户历史记录

ℹ️  此脚本将保留：
  ✓ 用户账号
  ✓ 设备库存
  ✓ 产品目录
  ✓ 项目和客户信息

📨 清理工单聊天消息...
✅ 清理了 1 条聊天消息
📝 清理工单历史记录...
✅ 清理了 5 条历史记录
👥 清理客户历史记录...
✅ 清理了 2 条客户历史
🎫 清理主工单表...
✅ 清理了 3 条工单
🆕 清理新工单表...
✅ 清理了 0 条新工单
✅ Repair_Tickets 自增ID已重置
✅ Repair_Ticket_History 自增ID已重置
✅ TicketMessage 自增ID已重置

🎉 工单数据清理完成！
📊 共清理了 11 条记录
```

---

## ⚠️ 注意事项

### 1. 数据不可恢复
- 清理操作是**永久性**的
- 执行前请确认不需要保留当前工单数据
- 建议在测试环境使用

### 2. 自增ID重置
- 清理后，新创建的工单ID将从 1 开始
- 历史记录ID也会重置
- 聊天消息ID也会重置

### 3. 用户登录
- 清理后，用户账号**不受影响**
- 可以直接使用原账号登录
- 无需重新注册

### 4. 运行前提
- 确保数据库连接正常
- 确保有足够的权限执行 DELETE 操作
- 确保应用未在运行中（避免并发问题）

---

## 🔄 清理后的操作

### 1. 重启应用（如果正在运行）
```bash
# 停止应用
Ctrl + C

# 重新启动
npm run dev
```

### 2. 刷新浏览器
- 按 `Ctrl + Shift + R`（强制刷新）
- 或清除浏览器缓存

### 3. 验证清理结果
- 登录系统
- 查看工单列表应该为空
- 查看仪表板应该显示 0 条工单

---

## 📁 脚本文件位置

```
axiom-repair/
├── scripts/
│   ├── clear-tickets-safe.ts      # 安全版清理脚本（推荐）
│   └── clear-all-tickets.ts       # 完全清理脚本（需确认）
└── docs/
    └── DATABASE_CLEANUP_GUIDE.md  # 本文档
```

---

## 🐛 常见问题

### Q1: 提示"表不存在"
**A:** 某些表可能尚未创建（如 `TicketMessage`），这是正常的，脚本会跳过这些表。

### Q2: 清理后仍能看到旧数据
**A:** 刷新浏览器缓存：`Ctrl + Shift + R`

### Q3: 清理后无法登录
**A:** 用户账号不会被清除，检查用户名和密码是否正确。

### Q4: 想恢复清理的数据
**A:** 数据清理后无法恢复。建议在清理前备份数据库。

---

## 💾 数据备份（可选）

在清理前备份数据库：

```bash
# SQL Server 备份命令示例
sqlcmd -S localhost -U AxinUser -Q "BACKUP DATABASE AxinRepairDB TO DISK='D:\backup\AxinRepairDB_backup.bak'"
```

---

## ✅ 测试流程建议

1. **清理数据**
   ```bash
   npx tsx scripts/clear-tickets-safe.ts
   ```

2. **重启应用**
   ```bash
   npm run dev
   ```

3. **刷新浏览器**
   - 按 `Ctrl + Shift + R`

4. **开始测试**
   - 创建新工单
   - 测试各项功能
   - 验证流程

---

## 📞 技术支持

如遇问题，请检查：
1. 数据库连接配置 (`lib/db-config.ts`)
2. 数据库服务是否运行
3. 用户权限是否足够
4. 控制台错误信息

---

**最后更新**: 2026-02-24
