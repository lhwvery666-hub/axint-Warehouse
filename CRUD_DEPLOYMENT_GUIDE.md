# 🚀 CRUD功能部署指南

## ⚡ 快速部署（3步完成）

### ✅ 好消息：无需数据库更新！

本次更新**不需要**执行任何数据库迁移脚本！  
所有必需字段已在 v2.0 中添加。

---

## 📝 部署步骤

### 步骤1: 停止应用

```bash
# 如果使用 PM2
pm2 stop axiom-repair

# 如果使用 systemd
sudo systemctl stop axiom-repair

# 或者直接关闭运行中的终端
```

---

### 步骤2: 构建应用

```bash
cd axiom-repair

# 安装依赖（如有新增，通常不需要）
npm install

# 构建应用
npm run build
```

**预期输出**:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                   XXX kB        XXX kB
└ ○ /warehouse/dashboard                XXX kB        XXX kB
...
```

---

### 步骤3: 启动应用

```bash
# 直接启动
npm start

# 或使用 PM2
pm2 start axiom-repair
pm2 save

# 或使用 systemd
sudo systemctl start axiom-repair
```

**验证启动成功**:
```bash
# 检查应用是否运行
pm2 status

# 或检查端口
netstat -ano | findstr :3000
```

---

## ✅ 部署验证清单

### 基础验证（1分钟）

- [ ] 应用可以正常访问
- [ ] 登录功能正常
- [ ] 主页显示正常
- [ ] 无控制台错误

### 功能验证（5分钟）

#### 1. 设备管理验证

```bash
测试步骤：
1. 登录现场人员账号
2. 进入任意批次详情页
3. 检查是否显示 [添加设备] 按钮 ✅
4. 点击设备列表的 [编辑] 按钮 ✅
5. 点击设备列表的 [删除] 按钮 ✅
```

#### 2. 批次信息验证

```bash
测试步骤：
1. 在批次详情页
2. 检查是否显示 [编辑批次信息] 按钮 ✅
3. 点击按钮打开编辑对话框 ✅
4. 修改项目名称并保存 ✅
5. 验证页面数据已更新 ✅
```

#### 3. 出厂日期验证

```bash
测试步骤：
1. 登录仓库管理员账号
2. 进入已确认的批次
3. 检查是否显示 [编辑出厂日期] 按钮 ✅
4. 点击按钮进入编辑模式 ✅
5. 修改出厂日期并自动保存 ✅
```

#### 4. 商务信息验证

```bash
测试步骤：
1. 登录商务人员账号
2. 进入已审核的批次
3. 检查是否显示 [修改商务信息] 按钮 ✅
4. 修改收款状态并保存 ✅
```

#### 5. 发货信息验证

```bash
测试步骤：
1. 登录仓库管理员账号
2. 进入已完成的批次
3. 检查是否显示 [修改发货信息] 按钮 ✅
4. 修改快递单号并保存 ✅
```

#### 6. 用户管理验证

```bash
测试步骤：
1. 登录管理员账号
2. 访问 /admin/users
3. 点击 [添加用户] 创建测试用户 ✅
4. 编辑测试用户信息 ✅
5. 删除测试用户 ✅
```

---

## 🐛 常见问题

### 问题1: 构建失败

```bash
错误: TypeScript编译错误

解决方案:
1. 清理缓存
   rm -rf .next
   npm run build

2. 检查Node版本
   node --version  # 应该 >= 18.0.0

3. 重新安装依赖
   rm -rf node_modules package-lock.json
   npm install
   npm run build
```

### 问题2: 编辑按钮不显示

```bash
可能原因:
1. 用户角色不正确
2. 组件未正确集成

检查步骤:
1. 打开浏览器控制台
2. 查看是否有React错误
3. 检查用户角色: console.log(user?.role)
4. 检查工单状态: console.log(batchInfo?.status)
```

### 问题3: API返回403权限错误

```bash
可能原因:
1. Cookie过期
2. 用户角色不匹配

解决方案:
1. 重新登录
2. 检查数据库中用户的Role字段
3. 确认Role值正确（首字母大写，如 "Warehouse"）
```

### 问题4: 保存后数据未更新

```bash
可能原因:
1. 缓存问题
2. 刷新函数未调用

解决方案:
1. 硬刷新页面 (Ctrl+F5)
2. 清除浏览器缓存
3. 检查控制台是否有错误
```

---

## 📊 性能监控

### 部署后监控指标

```bash
# CPU使用率
正常范围: < 60%
警告线: > 80%

# 内存使用率
正常范围: < 70%
警告线: > 85%

# API响应时间
正常: < 500ms
警告: > 1000ms
```

### 监控命令

```bash
# PM2监控
pm2 monit

# 查看日志
pm2 logs axiom-repair --lines 50

# 性能统计
pm2 describe axiom-repair
```

---

## 🔄 回滚方案

### 如果需要回滚

```bash
# 1. 停止应用
pm2 stop axiom-repair

# 2. 恢复备份代码
rm -rf axiom-repair
cp -r axiom-repair-backup-20260225 axiom-repair

# 3. 重新构建
cd axiom-repair
npm install
npm run build

# 4. 启动应用
pm2 start axiom-repair

# 注意：
# - 本次更新无数据库变更，无需回滚数据库
# - 如有v2.1创建的数据（如新添加的设备），回滚后仍可正常查看
```

---

## 📋 部署检查表

### 部署前 (Pre-Deployment)

- [ ] 代码已备份
- [ ] 通知用户系统维护
- [ ] 确认服务器资源充足

### 部署中 (During Deployment)

- [ ] 应用已停止
- [ ] 代码已更新
- [ ] 依赖已安装
- [ ] 构建成功（无错误）
- [ ] 应用已启动

### 部署后 (Post-Deployment)

- [ ] 应用可以正常访问
- [ ] 登录功能正常
- [ ] 所有页面可访问
- [ ] 新增按钮可见
- [ ] 编辑功能正常
- [ ] 无控制台错误
- [ ] 性能指标正常

### 功能测试

- [ ] 添加设备功能 ✅
- [ ] 编辑设备功能 ✅
- [ ] 删除设备功能 ✅
- [ ] 编辑批次信息 ✅
- [ ] 编辑出厂日期 ✅
- [ ] 编辑商务信息 ✅
- [ ] 编辑发货信息 ✅
- [ ] 用户管理功能 ✅

---

## 🎯 部署时间估算

| 步骤 | 预计时间 |
|------|----------|
| 停止应用 | 10秒 |
| 构建应用 | 2-5分钟 |
| 启动应用 | 20秒 |
| 基础验证 | 1分钟 |
| 功能测试 | 5分钟 |
| **总计** | **8-11分钟** |

---

## 📞 支持联系

部署过程中如遇问题：

1. 📖 查看 [CRUD系统指南](./docs/CRUD_SYSTEM_GUIDE.md)
2. 🔍 查看 [故障排查](./docs/CRUD_UPDATE_SUMMARY.md#故障排查)
3. 💬 联系技术支持

---

## 🎉 部署完成

恭喜！您已成功部署 CRUD 功能更新 v2.1.0

**下一步**:
1. 📢 通知用户新功能上线
2. 📚 分享 [用户更新说明](../CRUD_UPDATE_README.md)
3. 🎓 进行简短的功能演示

---

**版本**: v2.1.0  
**部署日期**: 2026-02-25  
**状态**: 🎊 部署成功
