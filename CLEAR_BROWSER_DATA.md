# 清理浏览器数据指南

如果浏览器中还有旧的测试数据，请按以下步骤清理：

## 方法 1：使用页面上的"清除测试数据"按钮

1. 登录系统
2. 进入"数据库管理"页面 (`/admin/database`)
3. 点击"清除测试数据"按钮
4. 确认清除
5. 页面会自动刷新

## 方法 2：手动清理浏览器 localStorage

### Chrome / Edge 浏览器：

1. 打开浏览器开发者工具：
   - 按 `F12` 或 `Ctrl+Shift+I` (Windows)
   - 按 `Cmd+Option+I` (Mac)

2. 切换到 "Application" 标签（或"应用程序"）

3. 在左侧找到 "Local Storage"
   - 展开 `http://localhost:3000`

4. 删除以下键：
   - `repair_tickets`
   - `repair_tasks`
   - 所有以 `axiom_db_` 开头的键
   - 所有以 `local_` 开头的键

5. 刷新页面 (`F5`)

### Firefox 浏览器：

1. 打开浏览器开发者工具：
   - 按 `F12` 或 `Ctrl+Shift+I` (Windows)
   - 按 `Cmd+Option+I` (Mac)

2. 切换到 "存储" 标签

3. 在左侧找到 "本地存储"
   - 展开 `http://localhost:3000`

4. 删除上述键

5. 刷新页面

## 方法 3：清除所有网站数据（最彻底）

### Chrome / Edge：

1. 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
2. 选择"时间范围"为"全部时间"
3. 勾选"Cookie 和其他网站数据"
4. 点击"清除数据"

### Firefox：

1. 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
2. 选择"时间范围"为"全部"
3. 勾选"Cookie 和网站数据"
4. 点击"立即清除"

## 注意事项

- 清除数据后，您需要重新登录
- 所有本地存储的测试数据都会被清除
- 真实数据存储在 SQL Server 中，不会被清除
