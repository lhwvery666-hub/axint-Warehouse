# 工作流程 v2.0 部署检查清单

## 部署前准备 ✅

### 1. 备份数据库

- [ ] 备份当前数据库
- [ ] 确认备份文件完整性
- [ ] 记录备份文件位置

```bash
# 备份命令示例
sqlcmd -S your_server -d your_database -E -Q "BACKUP DATABASE your_database TO DISK='D:\backups\repair_system_backup_20260225.bak'"
```

---

### 2. 检查环境

- [ ] Node.js 版本 >= 18.0.0
- [ ] SQL Server 可访问
- [ ] 磁盘空间充足（至少500MB）
- [ ] 网络连接正常

```bash
# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version
```

---

## 数据库更新 🗄️

### 3. 运行升级脚本

- [ ] 修改脚本中的数据库名（第6行）
- [ ] 在SQL Server Management Studio中打开脚本
- [ ] 执行脚本：`database/workflow_v2_upgrade.sql`
- [ ] 检查执行结果，确保没有错误

**关键输出**：
```
✅ ManufactureDate - 出厂日期
✅ WarrantyStatus - 保修状态
✅ WarehouseConfirmedAt - 仓库确认时间
✅ WarehouseConfirmedBy - 仓库确认人
✅ TechnicianCompletedAt - 维修完成时间
✅ TechnicianCompletedBy - 维修完成人
✅ BusinessReviewedAt - 商务审核时间
✅ BusinessReviewedBy - 商务审核人
✅ ShippingType - 发货方式
✅ WarehouseShippedAt - 仓库发货时间
✅ WarehouseShippedBy - 仓库发货人
✅ ReporterConfirmedAt - 现场确认时间
✅ 所有必需字段都已存在！
```

---

### 4. 验证字段

- [ ] 运行验证查询（见 `DATABASE_SCHEMA_UPDATE.md`）
- [ ] 确认所有12个新字段都已添加
- [ ] 检查字段类型和长度是否正确

```sql
-- 快速验证查询
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Tickets'
    AND COLUMN_NAME IN (
        'ManufactureDate', 'WarrantyStatus', 
        'WarehouseConfirmedAt', 'WarehouseConfirmedBy',
        'TechnicianCompletedAt', 'TechnicianCompletedBy',
        'BusinessReviewedAt', 'BusinessReviewedBy',
        'ShippingType', 'WarehouseShippedAt', 
        'WarehouseShippedBy', 'ReporterConfirmedAt'
    )
ORDER BY COLUMN_NAME;
```

**预期结果**：12行数据

---

## 应用部署 🚀

### 5. 停止应用

- [ ] 停止当前运行的应用
- [ ] 通知用户系统维护中

```bash
# 如果使用 PM2
pm2 stop axiom-repair

# 如果使用 systemd
sudo systemctl stop axiom-repair
```

---

### 6. 更新代码

- [ ] 备份当前代码
- [ ] 拉取最新代码或复制新文件
- [ ] 检查所有新文件都已存在

```bash
# 备份当前代码
cp -r axiom-repair axiom-repair-backup-20260225

# 拉取最新代码（如果使用 Git）
git pull origin main

# 或者复制新文件
# ...
```

**必须存在的新文件**：
- [ ] `components/warehouse-batch-confirm.tsx`
- [ ] `components/business-batch-review.tsx`
- [ ] `components/warehouse-batch-shipping.tsx`
- [ ] `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts`
- [ ] `app/api/tickets/business-confirm-batch/[batchId]/route.ts`
- [ ] `app/api/tickets/warehouse-shipping-batch/[batchId]/route.ts`
- [ ] `app/api/tickets/complete-repair-batch/[batchId]/route.ts`
- [ ] `app/api/tickets/warehouse-pending-batches/route.ts`
- [ ] `app/api/tickets/business-pending-batches/route.ts`
- [ ] `app/api/tickets/warehouse-shipping-batches/route.ts`

---

### 7. 安装依赖

- [ ] 运行 `npm install`
- [ ] 检查是否有依赖错误

```bash
npm install
```

---

### 8. 构建应用

- [ ] 运行 `npm run build`
- [ ] 检查构建是否成功
- [ ] 确认没有TypeScript错误

```bash
npm run build
```

**预期输出**：
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

---

### 9. 启动应用

- [ ] 运行 `npm start` 或使用进程管理器
- [ ] 检查应用是否正常启动
- [ ] 验证端口监听正常

```bash
# 直接启动
npm start

# 或使用 PM2
pm2 start npm --name "axiom-repair" -- start
pm2 save

# 或使用 systemd
sudo systemctl start axiom-repair
sudo systemctl status axiom-repair
```

---

## 功能测试 🧪

### 10. 基础功能测试

- [ ] 所有页面可以正常访问
- [ ] 登录功能正常
- [ ] 角色权限正确

---

### 11. 仓库管理员测试

- [ ] 登录仓库管理员账号
- [ ] 访问 `/warehouse/dashboard`
- [ ] 可以看到"待确认批次"和"待发货批次"两个标签页
- [ ] 创建一个测试批次，验证是否出现在待确认列表
- [ ] 进入确认界面，填写出厂日期
- [ ] 确认后，状态变为 `Warehouse_Confirmed`

---

### 12. 维修人员测试

- [ ] 登录维修人员账号
- [ ] 访问批次详情页
- [ ] 可以看到设备的出厂日期和保修状态
- [ ] 仓库未确认时，"编辑报告"按钮被禁用
- [ ] 仓库确认后，可以编辑维修报告
- [ ] 收到签字后，可以看到"完成维修"按钮
- [ ] 点击完成后，状态变为 `Business_Review`

---

### 13. 商务人员测试

- [ ] 登录商务人员账号
- [ ] 访问 `/business`
- [ ] 切换到"待审核批次"标签页
- [ ] 可以看到待审核的批次列表
- [ ] 进入审核界面
- [ ] 测试收费项目：必须确认收款
- [ ] 测试不收费项目：可以直接审核
- [ ] 审核通过后，状态变为 `Warehouse_Shipping`

---

### 14. 仓库发货测试

- [ ] 再次登录仓库管理员账号
- [ ] 切换到"待发货批次"标签页
- [ ] 可以看到待发货的批次列表
- [ ] 进入发货界面
- [ ] 测试"发回客户"：填写快递信息
- [ ] 测试"产品入库"：直接确认
- [ ] 完成后，状态变为 `Completed`

---

### 15. 时间线组件测试

- [ ] 在批次详情页查看时间线
- [ ] 桌面端：横向显示，可以看到所有9个步骤
- [ ] 移动端：垂直显示，清晰易读
- [ ] 当前步骤高亮显示
- [ ] 已完成步骤显示绿色打勾

---

### 16. 权限测试

- [ ] 现场人员无法访问仓库/商务页面
- [ ] 维修人员无法执行仓库/商务操作
- [ ] 仓库管理员无法编辑维修报告
- [ ] 商务人员无法编辑维修报告
- [ ] 只有对应角色可以执行对应操作

---

## 回归测试 🔄

### 17. 旧功能验证

- [ ] 现场人员创建工单（单设备）正常
- [ ] 维修人员编辑维修报告正常
- [ ] 现场人员签字回传正常
- [ ] 聊天功能正常
- [ ] 取消申请功能正常
- [ ] 工单搜索和筛选正常

---

### 18. 兼容性测试

- [ ] 旧状态正确映射到新状态
- [ ] 已完成的旧工单可以正常查看
- [ ] 旧数据不受影响

---

## 性能测试 ⚡

### 19. 批次性能测试

- [ ] 创建10台设备的批次 → 加载正常
- [ ] 创建20台设备的批次 → 加载正常
- [ ] 创建50台设备的批次 → 加载正常
- [ ] 时间线渲染流畅，无卡顿

---

### 20. 并发测试

- [ ] 多个角色同时操作同一批次
- [ ] 状态更新实时同步
- [ ] 无数据冲突和丢失

---

## 部署后检查 ✅

### 21. 日志检查

- [ ] 检查应用日志，无异常错误
- [ ] 检查数据库日志，无连接问题
- [ ] 检查网络日志，无请求失败

---

### 22. 监控指标

- [ ] CPU使用率正常（< 70%）
- [ ] 内存使用率正常（< 80%）
- [ ] 数据库连接正常
- [ ] 响应时间正常（< 2秒）

---

### 23. 用户通知

- [ ] 通知所有用户系统已升级
- [ ] 发送新功能介绍文档
- [ ] 提供培训或操作指南
- [ ] 建立反馈渠道

---

## 问题处理 🔧

### 如果部署失败

1. **数据库更新失败**
   - 检查SQL脚本是否有语法错误
   - 检查数据库连接是否正常
   - 查看数据库错误日志

2. **应用构建失败**
   - 检查TypeScript编译错误
   - 检查依赖是否安装完整
   - 运行 `npm install` 重新安装依赖

3. **应用启动失败**
   - 检查端口是否被占用
   - 检查环境变量是否配置正确
   - 查看应用日志

4. **功能异常**
   - 检查数据库字段是否都已添加
   - 检查API路由是否正确
   - 查看浏览器控制台错误

---

## 回滚方案 ⏮️

如果需要回滚到旧版本：

### 数据库回滚

```sql
-- ⚠️ 警告：会删除所有新增字段！
-- ⚠️ 请先确认是否需要回滚！

ALTER TABLE Repair_Tickets DROP COLUMN ManufactureDate;
ALTER TABLE Repair_Tickets DROP COLUMN WarrantyStatus;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseConfirmedAt;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseConfirmedBy;
ALTER TABLE Repair_Tickets DROP COLUMN TechnicianCompletedAt;
ALTER TABLE Repair_Tickets DROP COLUMN TechnicianCompletedBy;
ALTER TABLE Repair_Tickets DROP COLUMN BusinessReviewedAt;
ALTER TABLE Repair_Tickets DROP COLUMN BusinessReviewedBy;
ALTER TABLE Repair_Tickets DROP COLUMN ShippingType;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseShippedAt;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseShippedBy;
ALTER TABLE Repair_Tickets DROP COLUMN ReporterConfirmedAt;
```

### 代码回滚

```bash
# 停止应用
pm2 stop axiom-repair

# 恢复备份代码
rm -rf axiom-repair
cp -r axiom-repair-backup-20260225 axiom-repair

# 重新构建和启动
cd axiom-repair
npm install
npm run build
pm2 start npm --name "axiom-repair" -- start
```

---

## 部署完成确认 ✅

### 最终检查

- [ ] 所有新功能都可正常使用
- [ ] 旧功能没有受到影响
- [ ] 无报错和警告信息
- [ ] 用户已收到升级通知
- [ ] 文档已更新到最新版本

### 部署签字

- **部署日期**: _______________
- **部署人员**: _______________
- **测试人员**: _______________
- **审核人员**: _______________

---

## 🎉 部署完成！

恭喜您成功部署了工作流程 v2.0！

**下一步**：
1. 📖 查看 [用户角色操作指南](./docs/USER_ROLE_GUIDE.md)
2. 🧪 运行 [测试指南](./docs/WORKFLOW_TEST_GUIDE.md)
3. 📚 阅读 [完整工作流程说明](./docs/COMPLETE_WORKFLOW_SYSTEM.md)

---

**版本**: v2.0.0  
**日期**: 2026-02-25  
**状态**: 🚀 准备部署
