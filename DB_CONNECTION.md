# SQL Server 数据库连接配置

## 连接信息

- **Server (Host)**: localhost
- **Database Name**: AxinRepairDB
- **User**: AxinUser
- **Password**: Set `DB_PASSWORD` in the local environment file; never commit the real value.
- **Port**: 1433 (默认端口)

## 配置文件

数据库连接配置位于 `lib/db-config.ts`，包含以下重要配置：

```typescript
options: {
  encrypt: true,
  trustServerCertificate: true // 必须开启这个，否则本地连接会报错
}
```

## 测试数据库连接

### 方法 1: 使用测试页面（推荐）

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 在浏览器中访问：
   ```
   http://localhost:3000/test-db
   ```

3. 点击"测试数据库连接"按钮

4. 如果连接成功，会显示绿色的成功消息："连接数据库成功"

### 方法 2: 使用 API 端点

直接访问 API 端点：
```bash
curl http://localhost:3000/api/db/test
```

或者在浏览器中访问：
```
http://localhost:3000/api/db/test
```

## 使用数据库连接

在其他文件中使用数据库连接：

```typescript
import { getDbConnection } from '@/lib/db-config';

// 获取连接池
const pool = await getDbConnection();

// 执行查询
const result = await pool.request().query('SELECT * FROM YourTable');
```

## 注意事项

1. 确保 SQL Server 服务正在运行
2. 确保数据库 `AxinRepairDB` 已创建
3. 确保用户 `AxinUser` 有足够的权限
4. 如果连接失败，检查防火墙设置和 SQL Server 配置
