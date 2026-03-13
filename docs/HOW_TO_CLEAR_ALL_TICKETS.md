# 清空所有维修工单数据

## 📋 使用场景

- 测试环境数据重置
- 开发调试后清理测试数据
- 系统演示前的数据准备

## ⚠️ 重要警告

**此操作将删除所有工单数据，包括：**
- ✅ 所有维修工单记录 (`Repair_Tickets`)
- ✅ 所有工单操作历史 (`Repair_Ticket_History`)
- ✅ 重置自增ID

**不会删除的数据：**
- ❌ 用户账户 (`Users`)
- ❌ 设备型号库 (`Device_Models`)
- ❌ 客户历史记录 (`Customer_History`)
- ❌ 系统配置

## 🗂️ 提供的脚本

### 1. 完整版（推荐）
**文件**: `scripts/CLEAR_ALL_TICKETS.sql`

**特点**:
- ✅ 包含备份提示
- ✅ 显示删除前的数据统计
- ✅ 使用事务保护
- ✅ 错误处理和回滚
- ✅ 详细的执行日志

**适用**: 生产环境或需要谨慎操作的场景

### 2. 快速版
**文件**: `scripts/CLEAR_ALL_TICKETS_QUICK.sql`

**特点**:
- ✅ 简洁快速
- ✅ 直接执行
- ✅ 适合开发环境

**适用**: 测试/开发环境快速清理

---

## 📖 使用方法

### 方法1: SQL Server Management Studio (SSMS)

1. **打开 SSMS** 并连接到数据库
2. **选择数据库**: `axiom_repair_db`
3. **打开脚本文件**:
   - 完整版: `axiom-repair/scripts/CLEAR_ALL_TICKETS.sql`
   - 快速版: `axiom-repair/scripts/CLEAR_ALL_TICKETS_QUICK.sql`
4. **执行脚本**: 点击 "Execute" 或按 `F5`
5. **查看结果**: 检查输出窗口的日志

### 方法2: Azure Data Studio

1. **打开 Azure Data Studio** 并连接到数据库
2. **新建查询窗口**
3. **复制粘贴脚本内容**
4. **执行查询**: 点击 "Run" 或按 `F5`
5. **验证结果**: 检查输出面板

### 方法3: 命令行 (sqlcmd)

```bash
# Windows
sqlcmd -S localhost -d axiom_repair_db -i "axiom-repair/scripts/CLEAR_ALL_TICKETS_QUICK.sql"

# 如果需要用户名密码
sqlcmd -S localhost -U sa -P YourPassword -d axiom_repair_db -i "scripts/CLEAR_ALL_TICKETS_QUICK.sql"
```

---

## 🔒 安全建议

### 1. 备份数据库（强烈推荐）

**执行清空前**，先备份数据库：

```sql
-- 完整备份
BACKUP DATABASE [axiom_repair_db] 
TO DISK = 'C:\Backup\axiom_repair_db_backup_20260228.bak'
WITH FORMAT, COMPRESSION;
```

**恢复备份**（如果需要）：

```sql
-- 恢复备份
USE master;
GO

ALTER DATABASE [axiom_repair_db] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
GO

RESTORE DATABASE [axiom_repair_db]
FROM DISK = 'C:\Backup\axiom_repair_db_backup_20260228.bak'
WITH REPLACE;
GO

ALTER DATABASE [axiom_repair_db] SET MULTI_USER;
GO
```

### 2. 仅在测试环境使用

- ✅ **测试环境**: 可以随时使用
- ⚠️ **预生产环境**: 谨慎使用，需审批
- ❌ **生产环境**: 不建议使用，除非有完整备份和恢复方案

### 3. 验证环境

执行前确认当前数据库环境：

```sql
-- 检查当前数据库
SELECT DB_NAME() AS CurrentDatabase;

-- 检查服务器名称
SELECT @@SERVERNAME AS ServerName;

-- 检查工单数量
SELECT COUNT(*) AS TotalTickets FROM Repair_Tickets;
```

---

## 📊 脚本详解

### 完整版脚本流程

```
1. 显示备份提示
   ↓
2. 统计当前数据量
   ↓
3. 开始事务
   ↓
4. 删除历史记录
   ↓
5. 删除工单
   ↓
6. 重置自增ID
   ↓
7. 提交事务
   ↓
8. 显示执行结果
   ↓
9. 验证清空结果
```

### 快速版脚本流程

```
1. 删除历史记录
   ↓
2. 删除工单
   ↓
3. 重置自增ID
   ↓
4. 验证结果
```

---

## 🧪 验证清空结果

执行后，运行以下查询验证：

```sql
-- 应该返回 0
SELECT COUNT(*) AS '剩余工单数' FROM Repair_Tickets;

-- 应该返回 0
SELECT COUNT(*) AS '剩余历史记录数' FROM Repair_Ticket_History;

-- 检查自增ID是否已重置（下一个ID应该是1）
SELECT 
    IDENT_CURRENT('Repair_Tickets') AS CurrentTicketID,
    IDENT_CURRENT('Repair_Ticket_History') AS CurrentHistoryID;
```

---

## 🔄 重新开始测试流程

清空数据后，您可以：

1. **创建新的测试工单**
   - 登录现场人员账号
   - 创建批次工单
   - 工单ID将从 `WO2602280001` 开始

2. **测试完整流程**
   - 创建 → 仓库确认 → 维修 → 商务审核 → 发货 → 完成

3. **测试异常流程**
   - 取消工单
   - 修改工单
   - 退回修改

---

## 📝 常见问题

### Q1: 脚本执行失败怎么办？

**A**: 检查以下几点：
1. 数据库连接是否正常
2. 是否有足够的权限（需要 `DELETE` 和 `DBCC` 权限）
3. 是否有外键约束冲突
4. 查看错误信息并根据提示处理

### Q2: 能否只删除某个状态的工单？

**A**: 可以！使用条件删除：

```sql
-- 只删除已取消的工单
DELETE FROM Repair_Ticket_History 
WHERE BatchId IN (
    SELECT DISTINCT BatchId 
    FROM Repair_Tickets 
    WHERE Status = 'Cancelled'
);

DELETE FROM Repair_Tickets 
WHERE Status = 'Cancelled';
```

### Q3: 如何只删除测试数据？

**A**: 如果测试工单有特定标识（如BatchId包含"TEST"），可以：

```sql
-- 删除BatchId包含"TEST"的工单
DELETE FROM Repair_Ticket_History 
WHERE BatchId LIKE '%TEST%';

DELETE FROM Repair_Tickets 
WHERE BatchId LIKE '%TEST%';
```

### Q4: 删除后前端还显示旧数据？

**A**: 清除浏览器缓存或刷新页面：
- Chrome: `Ctrl + Shift + R` (强制刷新)
- 或清除 Application → Local Storage

---

## ⚡ 快速命令参考

```sql
-- 查看工单数量
SELECT COUNT(*) FROM Repair_Tickets;

-- 查看最新的10条工单
SELECT TOP 10 * FROM Repair_Tickets ORDER BY CreatedAt DESC;

-- 查看各状态的工单数量
SELECT Status, COUNT(*) AS Count 
FROM Repair_Tickets 
GROUP BY Status;

-- 清空所有数据（快速版）
DELETE FROM Repair_Ticket_History;
DELETE FROM Repair_Tickets;
DBCC CHECKIDENT ('Repair_Tickets', RESEED, 0);
DBCC CHECKIDENT ('Repair_Ticket_History', RESEED, 0);
```

---

## ✅ 执行清单

在执行清空操作前，请确认：

- [ ] 已确认当前为测试/开发环境
- [ ] 已备份数据库（如果是重要环境）
- [ ] 已通知相关人员（如果是共享环境）
- [ ] 已确认数据库连接正确
- [ ] 已理解此操作不可逆
- [ ] 准备好重新创建测试数据

执行后，请验证：

- [ ] 工单表已清空（COUNT = 0）
- [ ] 历史记录表已清空（COUNT = 0）
- [ ] 自增ID已重置
- [ ] 前端页面刷新后无旧数据
- [ ] 可以创建新的工单

---

## 📞 支持

如有问题，请联系系统管理员或查看：
- 项目文档: `axiom-repair/docs/`
- 数据库 Schema: `axiom-repair/prisma/schema.prisma`
