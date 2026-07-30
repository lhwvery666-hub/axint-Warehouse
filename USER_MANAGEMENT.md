# 用户管理系统使用说明

## 功能概述

已创建完整的用户管理系统，所有数据存储在 SQL Server 数据库中，密码使用 bcrypt 加密存储。

## 数据库表结构

确保 `Users` 表包含以下字段：
- `UserID` (主键，自增)
- `Username` (用户名，唯一)
- `Password` (密码，加密存储)
- `Role` (角色：Admin, Technician, Warehouse, Reporter)
- `RealName` (真实姓名)
- `CreatedAt` (创建时间，可选)
- `UpdatedAt` (更新时间，可选)

如果表没有 `CreatedAt` 和 `UpdatedAt` 字段，SQL 会自动使用 `GETDATE()` 作为默认值。

## 创建测试用户

### 方法 1：使用脚本（推荐）

运行以下命令创建测试用户：

```bash
npm run create-test-users
```

或直接运行：

```bash
tsx scripts/create-test-users.ts
```

### 测试账号列表

脚本会创建以下测试账号：

| 角色 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| 管理员 | `admin` | `TEST_USER_PASSWORD` | 系统管理员 |
| 维修工程师 | `tech` | `TEST_USER_PASSWORD` | 维修工程师 |
| 仓库管理员 | `warehouse` | `TEST_USER_PASSWORD` | 仓库管理员 |
| 现场报告人员 | `reporter` | `TEST_USER_PASSWORD` | 现场报告人员 |

**注意**：测试密码通过本地环境变量 `TEST_USER_PASSWORD` 提供，不得写入代码或文档。

### 方法 2：手动创建

1. 登录系统（使用管理员账号）
2. 进入"用户管理"页面 (`/admin/users`)
3. 点击"添加用户"按钮
4. 填写用户信息并保存

## API 接口

### 获取用户列表
```
GET /api/users
```

### 创建用户
```
POST /api/users
Body: {
  username: string,
  password: string,
  realName: string,
  role?: "Admin" | "Technician" | "Warehouse" | "Reporter"
}
```

### 获取单个用户
```
GET /api/users/[id]
```

### 更新用户
```
PUT /api/users/[id]
Body: {
  realName?: string,
  password?: string,  // 可选，留空则不修改
  role?: string | null
}
```

### 删除用户
```
DELETE /api/users/[id]
```

## 密码加密

- 所有密码使用 **bcrypt** 加密存储
- 加密强度：10 轮（saltRounds = 10）
- 登录时自动识别明文密码（向后兼容）和加密密码

## 角色说明

- **Admin** - 管理员：可以管理所有用户和系统设置
- **Technician** - 维修工程师：可以查看和处理维修工单
- **Warehouse** - 仓库管理员：可以管理设备和数据库
- **Reporter** - 现场报告人员：可以提交维修报告

## 注意事项

1. 新注册的用户默认没有角色，需要管理员授予角色后才能登录
2. 密码在数据库中加密存储，前端无法查看原始密码
3. 删除用户时，不能删除管理员账号（保护机制）
4. 所有用户数据存储在 SQL Server 中，不再使用 localStorage

## 使用流程

1. **首次使用**：
   - 运行 `npm run create-test-users` 创建测试账号
   - 使用 `admin / admin123` 登录系统

2. **管理用户**：
   - 登录后进入"用户管理"页面
   - 可以添加、编辑、删除用户
   - 可以为新注册的用户授予角色

3. **用户注册**：
   - 用户可以通过注册页面注册账号
   - 注册后需要等待管理员授予角色
   - 获得角色后才能登录系统
