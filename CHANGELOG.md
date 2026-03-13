# 更新日志 (CHANGELOG)

## [v2.1.0] - 2026-02-25

### ✨ 新增功能

#### 批次设备管理
- 新增向批次中添加设备的功能
- 新增编辑设备信息的功能
- 新增删除设备的功能（软删除）
- 新增 `BatchDeviceManager` 组件

#### 批次信息编辑
- 新增批次基本信息编辑功能
- 支持修改项目名称、联系信息、地址等
- 新增 `BatchInfoEditor` 组件

#### 出厂日期管理
- 新增仓库确认后修改出厂日期的功能
- 自动重新计算保修状态
- 支持编辑模式切换

#### 商务信息管理
- 新增获取已保存商务信息的API
- 新增审核后修改商务信息的功能
- 支持修改收款、开票状态和金额

#### 发货信息管理
- 新增获取已保存发货信息的API
- 新增发货后修改发货信息的功能
- 支持修改快递单号、发货日期等

#### 用户管理增强
- 新增通用 `UserManagement` 组件
- 完善的用户搜索和筛选功能
- 角色统计仪表板

### 📝 API变更

#### 新增API端点

- `POST /api/tickets/batch-devices/[batchId]` - 添加设备
- `PUT /api/tickets/batch-devices/[batchId]` - 编辑设备
- `DELETE /api/tickets/batch-devices/[batchId]` - 删除设备
- `PUT /api/tickets/batch-info/[batchId]` - 编辑批次信息
- `PUT /api/tickets/manufacture-date/[deviceId]` - 编辑出厂日期
- `GET /api/tickets/business-info/[batchId]` - 获取商务信息
- `PUT /api/tickets/business-info/[batchId]` - 编辑商务信息
- `GET /api/tickets/shipping-info/[batchId]` - 获取发货信息
- `PUT /api/tickets/shipping-info/[batchId]` - 编辑发货信息

### 🔧 组件更新

#### 新增组件

- `components/batch-device-manager.tsx` - 设备管理组件
- `components/batch-info-editor.tsx` - 批次信息编辑组件
- `components/user-management.tsx` - 用户管理组件

#### 更新组件

- `components/warehouse-batch-confirm.tsx` - 添加出厂日期编辑模式
- `components/business-batch-review.tsx` - 添加商务信息编辑模式
- `components/warehouse-batch-shipping.tsx` - 添加发货信息编辑模式
- `components/batch-work-order-detail.tsx` - 集成设备和批次信息编辑器

### 📚 文档更新

- 新增 `docs/CRUD_SYSTEM_GUIDE.md` - CRUD系统完整指南
- 新增 `docs/CRUD_QUICK_REFERENCE.md` - 快速参考手册
- 新增 `docs/CRUD_UPDATE_SUMMARY.md` - 技术更新总结
- 新增 `CRUD_UPDATE_README.md` - 用户更新说明

### 🔐 安全性

- 所有编辑操作都有严格的权限验证
- 前端按钮权限控制 + 后端API权限验证
- 操作记录（时间戳 + 操作人）

### 🛡️ 数据保护

- 采用软删除策略
- 保留完整历史数据
- 支持数据审计和追溯

### ⚡ 性能优化

- 按需加载编辑组件
- 局部数据刷新
- 利用现有数据库索引

---

## [v2.0.0] - 2026-02-25

### ✨ 新增功能

#### 9步完整工作流程
- 现场人员创建工单
- 仓库管理员确认设备信息并填写出厂日期
- 维修人员检查设备并填写维修报告
- 现场人员签字确认
- 维修人员进行实际维修
- 商务人员审核收款和开票
- 仓库管理员安排发货或入库
- 工单完成

#### 新增组件
- `warehouse-batch-confirm.tsx` - 仓库确认界面
- `business-batch-review.tsx` - 商务审核界面
- `warehouse-batch-shipping.tsx` - 仓库发货界面

#### 新增API
- 仓库确认批次API
- 商务确认批次API
- 仓库发货批次API
- 维修完成批次API
- 各类批次列表API

#### 数据库更新
- 新增12个字段支持新工作流程
- 提供完整的SQL升级脚本

#### 文档更新
- 完整的工作流程文档
- 测试指南
- 用户操作手册
- 数据库更新说明
- 部署检查清单

---

## [v1.0.0] - 2026-01-XX

### 🎉 初始版本

- 基础工单管理系统
- 用户登录和权限管理
- 维修报告编辑
- 工单聊天功能
- 现场人员工单创建

---

## 📊 版本演进

```
v1.0.0 (基础版)
   ↓
   添加完整工作流程
   ↓
v2.0.0 (工作流程版)
   ↓
   添加完整CRUD功能
   ↓
v2.1.0 (CRUD版) ← 当前版本 ⭐
```

---

## 🔮 下一版本规划 (v2.2.0)

可能的新功能：

- [ ] 批量编辑设备功能
- [ ] 批次复制和模板功能
- [ ] Excel导入/导出设备列表
- [ ] 完整的操作日志系统
- [ ] 数据版本控制和回滚
- [ ] 高级搜索和筛选
- [ ] 批次工单模板管理

---

**保持关注，更多精彩功能即将推出！** 🚀
