/**
 * PM2 进程管理配置文件
 *
 * 这个文件告诉 PM2（进程管理器）如何启动、重启、监控你的 Next.js 应用。
 * 你可以把它类比为"后台守护程序的配置清单"。
 *
 * 使用方法（在服务器上执行）：
 *   npm run build                   # 先构建
 *   pm2 start ecosystem.config.js   # 用 PM2 启动
 *   pm2 save                        # 保存进程列表
 *   pm2 startup                     # 设置开机自启
 *
 * 常用命令：
 *   pm2 list                        # 查看所有进程
 *   pm2 logs axiom-repair           # 查看日志
 *   pm2 reload axiom-repair         # 零停机热重载（更新代码后使用）
 *   pm2 stop axiom-repair           # 停止
 */

const { loadEnvConfig } = require('@next/env');

loadEnvConfig(__dirname);

function requireEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

module.exports = {
  apps: [
    {
      // ── 基本信息 ─────────────────────────────────────────────────────────────
      name: 'axiom-repair',

      // standalone 模式下直接运行 server.js，比 next start 启动更快、内存更小
      script: '.next/standalone/server.js',

      // ── 运行模式 ─────────────────────────────────────────────────────────────
      // 'cluster' 模式会启动多个进程，利用多核 CPU，提高并发能力
      // 如果服务器是单核或内存紧张，改为 'fork'
      exec_mode: 'cluster',
      instances: 'max', // 自动匹配 CPU 核数；也可以写固定数字如 2

      // ── 日志 ─────────────────────────────────────────────────────────────────
      output: './logs/out.log',   // 标准输出日志
      error:  './logs/error.log', // 错误日志
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,           // cluster 模式下合并所有实例的日志

      // ── 自动重启策略 ─────────────────────────────────────────────────────────
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',   // 进程至少稳定运行 10 秒才算启动成功
      restart_delay: 3000, // 崩溃后等待 3 秒再重启（避免快速循环崩溃）

      // ── 环境变量 ─────────────────────────────────────────────────────────────
      // 修改下面的值为你实际服务器的配置
      // 如果不想把密码写在这里，可以改为读取 .env.production 文件：
      //   require('dotenv').config({ path: '.env.production' })
      //   然后把 env_production 下的值改为 process.env.XXX
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',

        // ── SQL Server 连接 ────────────────────────────────────────────────
        // SQL Server 和 Web 服务在同一台机器时，用 localhost
        DB_SERVER:   process.env.DB_SERVER || 'localhost',
        DB_DATABASE: process.env.DB_DATABASE || 'AxinRepairDB',
        DB_USER:     process.env.DB_USER || 'AxinUser',
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_PORT:     process.env.DB_PORT || '1433',
        DB_ENCRYPT:     process.env.DB_ENCRYPT || 'false',
        DB_TRUST_CERT:  process.env.DB_TRUST_CERT || 'true',
        DB_POOL_MAX:    process.env.DB_POOL_MAX || '10',

        // Prisma 连接字符串
        DATABASE_URL: requireEnvironmentVariable('DATABASE_URL'),

        // ── 文件存储 ───────────────────────────────────────────────────────
        // 本地存储（文件保存在服务器磁盘）
        STORAGE_MODE: process.env.STORAGE_MODE || 'local',
        UPLOAD_DIR:   process.env.UPLOAD_DIR || '',  // 留空则默认用 ./public/uploads

        // 如果改用 MinIO / S3，取消下面的注释并填写真实值：
        // STORAGE_MODE:        's3',
        // S3_ENDPOINT:         'https://your-minio:9000',
        // S3_REGION:           'ap-east-1',
        // S3_BUCKET:           'axiom-repair',
        // S3_ACCESS_KEY_ID:    'your-key',
        // S3_SECRET_ACCESS_KEY:'your-secret',
        // S3_PUBLIC_URL:       'https://your-cdn',
      },
    },
  ],
};
