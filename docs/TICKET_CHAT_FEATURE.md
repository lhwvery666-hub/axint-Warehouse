# 工单聊天功能说明

## 📋 功能概述

为维修工单系统添加了**基于工单号的实时沟通模块**，允许维修人员、现场人员、客户、管理员等在特定工单下进行沟通交流。

## 🎯 核心特性

### 工单绑定
- ✅ 每条聊天记录都**严格绑定到工单号** (`ticketId`)
- ✅ 不是全局聊天室，而是**单独工单的上下文沟通**
- ✅ 不同工单之间的聊天记录完全隔离

### 角色显示
- ✅ 根据 `senderRole` 区分消息发送者角色
- ✅ 当前用户的消息显示在**右侧（蓝色气泡）**
- ✅ 其他用户的消息显示在**左侧（灰色气泡）**
- ✅ 显示发送者名称和头像首字母

### 实时交互
- ✅ 发送消息后**立即显示**在列表中
- ✅ 自动滚动到最新消息
- ✅ 按 Enter 键快速发送消息
- ✅ 显示"刚刚"、"X分钟前"等时间戳

## 🗄️ 数据库模型

### Prisma Schema 定义

```prisma
model TicketMessage {
  id         Int      @id @default(autoincrement()) @map("Id")
  ticketId   String   @map("TicketId") @db.NVarChar(100)
  senderName String   @map("SenderName") @db.NVarChar(100)
  senderRole String   @map("SenderRole") @db.NVarChar(50)
  content    String   @map("Content") @db.NVarChar(Max)
  createdAt  DateTime @default(now()) @map("CreatedAt")

  @@index([ticketId], map: "IX_TicketMessage_TicketId")
  @@map("TicketMessage")
}
```

### 字段说明
- **id**: 主键，自增ID
- **ticketId**: 工单号（可以是 BatchId 或单个设备的 ID）
- **senderName**: 发送者名称（如"张三"、"客户李四"）
- **senderRole**: 发送者角色（如 'technician', 'reporter', 'admin'）
- **content**: 消息文本内容
- **createdAt**: 发送时间（自动生成）

## 🛠️ 技术实现

### 1. 数据库模型 (`prisma/schema.prisma`)
- ✅ 添加了 `TicketMessage` 模型
- ✅ 包含索引优化查询性能

### 2. 后端 API (`app/api/messages/route.ts`)

#### GET 请求
```typescript
GET /api/messages?ticketId=xxx
```
- 获取指定工单的所有聊天消息
- 按时间升序排列
- 返回消息数组和总数

#### POST 请求
```typescript
POST /api/messages
Body: {
  ticketId: string,
  senderName: string,
  senderRole: string,
  content: string
}
```
- 发送新消息到指定工单
- 验证必填参数
- 返回新创建的消息对象

### 3. 前端组件 (`components/TicketChat.tsx`)

#### Props 接口
```typescript
interface TicketChatProps {
  ticketId: string;          // 工单号
  currentUser: {             // 当前登录用户
    name: string;            // 用户名
    role: UserRole;          // 用户角色枚举
  };
}
```

#### 核心功能
- 加载历史消息
- 发送新消息
- 自动滚动到底部
- 微信风格的聊天气泡
- 时间戳格式化显示
- Loading 和空状态提示

### 4. 页面集成 (`components/repair-detail.tsx`)

- ✅ 作为第5个 Accordion 面板集成
- ✅ 所有角色都可以查看和参与聊天
- ✅ 自动传递当前工单号和用户信息
- ✅ 响应式布局，高度固定为 600px

## 📱 UI 设计

### 布局结构
```
┌─────────────────────────────────────┐
│  工单沟通记录 (X 条消息)            │
├─────────────────────────────────────┤
│                                     │
│  [消息列表区域 - 可滚动]            │
│   - 左侧气泡：其他人发送            │
│   - 右侧气泡：我发送                │
│                                     │
├─────────────────────────────────────┤
│  [输入框] [发送按钮]                │
│  当前身份：张三 (维修工程师)         │
└─────────────────────────────────────┘
```

### 样式特点
- **微信风格气泡**：圆角、带尾巴效果
- **颜色区分**：
  - 我的消息：蓝色背景 (#3B82F6)
  - 对方消息：灰色背景 (#F3F4F6)
- **圆形头像**：显示名字首字母
- **时间戳**：智能显示相对时间

## 🚀 部署步骤

### 1. 生成 Prisma Client
```bash
cd "D:\MY app\axiom-repair"
npx prisma generate
```

### 2. 同步数据库结构
```bash
npx prisma db push
```
> 这会在 SQL Server 中创建 `TicketMessage` 表

### 3. 验证数据库
检查 SQL Server 是否成功创建了表：
```sql
SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TicketMessage'
```

### 4. 重启应用
```bash
npm run dev
```

## 🧪 测试清单

### 后端测试
- [ ] GET `/api/messages?ticketId=test123` 返回空数组
- [ ] POST `/api/messages` 发送新消息成功
- [ ] GET `/api/messages?ticketId=test123` 返回刚才的消息
- [ ] 测试无效参数返回 400 错误

### 前端测试
- [ ] 打开工单详情页，展开"工单沟通记录"面板
- [ ] 显示"暂无聊天记录"空状态
- [ ] 输入消息并点击"发送"
- [ ] 消息立即显示在右侧（蓝色气泡）
- [ ] 刷新页面，消息依然存在
- [ ] 多个用户发送消息，气泡左右分布正确
- [ ] 滚动条自动滚到底部
- [ ] 按 Enter 键可以发送消息

### 角色测试
- [ ] 维修人员登录：发送消息显示"维修工程师"
- [ ] 现场人员登录：发送消息显示"现场报告人员"
- [ ] 管理员登录：可以查看和发送消息
- [ ] 切换不同工单，聊天记录正确隔离

## 📁 文件清单

```
新增/修改的文件：
├── prisma/schema.prisma                    # 添加 TicketMessage 模型
├── app/api/messages/route.ts               # 聊天消息 API (GET/POST)
├── components/TicketChat.tsx               # 聊天组件（新建）
├── components/repair-detail.tsx            # 集成聊天组件
└── docs/TICKET_CHAT_FEATURE.md             # 本说明文档

数据库变更：
└── TicketMessage 表（自动创建）
```

## ⚠️ 注意事项

### 1. 工单号绑定
- `ticketId` 可以是批次号 (`BatchId`) 或单个设备 ID (`Id`)
- 确保传递的 `ticketId` 在工单详情页中是正确的
- 不同工单的聊天记录是完全隔离的

### 2. 性能优化
- 已为 `ticketId` 字段添加索引
- 如果单个工单消息过多（>1000条），考虑添加分页

### 3. 权限控制
- 当前所有角色都可以查看和发送消息
- 如需限制特定角色，在 `repair-detail.tsx` 中添加条件渲染

### 4. 实时推送
- 当前需要刷新页面才能看到新消息
- 如需实时推送，可以集成 WebSocket 或 Server-Sent Events

## 🔮 未来扩展

### 可选功能
- [ ] 上传图片附件
- [ ] @提及特定用户
- [ ] 消息已读/未读状态
- [ ] 消息删除/编辑功能
- [ ] 实时推送（WebSocket）
- [ ] 消息搜索功能
- [ ] 导出聊天记录

## 📞 技术支持

如遇问题，请检查：
1. Prisma Client 是否已生成
2. 数据库连接是否正常
3. TicketMessage 表是否存在
4. 浏览器控制台是否有错误信息

---

**遵循 Cursor Rules**: 
- ✅ 使用 `UserRole` 枚举而非硬编码
- ✅ 使用 Prisma 管理数据库模型
- ✅ TypeScript 严格模式
- ✅ 完整的错误处理
- ✅ 中文注释和说明
