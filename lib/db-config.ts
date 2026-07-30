import * as sql from 'mssql';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')

interface ParsedDatabaseUrl {
  server?: string
  database?: string
  user?: string
  password?: string
  port?: number
}

function parseDatabaseUrl(value: string | undefined): ParsedDatabaseUrl {
  if (!value) {
    return {}
  }

  const prefix = "sqlserver://"
  if (!value.startsWith(prefix)) {
    throw new Error("DATABASE_URL must use the sqlserver:// scheme")
  }

  const [serverAddress, ...optionParts] = value.slice(prefix.length).split(";")
  const lastColonIndex = serverAddress.lastIndexOf(":")
  const parsedPort = lastColonIndex > -1
    ? Number(serverAddress.slice(lastColonIndex + 1))
    : undefined
  const server = lastColonIndex > -1
    ? serverAddress.slice(0, lastColonIndex)
    : serverAddress
  const options = new Map<string, string>()

  for (const optionPart of optionParts) {
    const separatorIndex = optionPart.indexOf("=")
    if (separatorIndex <= 0) {
      continue
    }

    const key = optionPart.slice(0, separatorIndex).toLowerCase()
    const rawValue = optionPart.slice(separatorIndex + 1)
    options.set(key, decodeURIComponent(rawValue))
  }

  return {
    server: server || undefined,
    database: options.get("database"),
    user: options.get("user"),
    password: options.get("password"),
    port: Number.isInteger(parsedPort) ? parsedPort : undefined,
  }
}

const parsedDatabaseUrl = parseDatabaseUrl(process.env.DATABASE_URL)
const databasePassword = process.env.DB_PASSWORD || parsedDatabaseUrl.password

if (!databasePassword) {
  throw new Error("DB_PASSWORD or a password in DATABASE_URL is required")
}

// ────────────────────────────────────────────────────────────────────────────
// SQL Server 连接配置
//
// 所有敏感信息从环境变量读取，不再硬编码。
// 本地开发时在项目根目录创建 .env.local 文件（参考 .env.example）。
// 生产部署时通过 Docker 环境变量或 PM2 ecosystem.config.js 注入。
// ────────────────────────────────────────────────────────────────────────────
export const dbConfig: sql.config = {
  server:   process.env.DB_SERVER   || parsedDatabaseUrl.server || 'localhost',
  database: process.env.DB_DATABASE || parsedDatabaseUrl.database || 'AxinRepairDB',
  user:     process.env.DB_USER     || parsedDatabaseUrl.user || 'AxinUser',
  password: databasePassword,
  port:     parseInt(process.env.DB_PORT || String(parsedDatabaseUrl.port || 1433), 10),
  options: {
    encrypt:                Boolean(process.env.DB_ENCRYPT === 'true'),
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false', // 内网默认 true
    enableArithAbort:       true,
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: 0,
    // 空闲超时 10 分钟，避免连接被关闭后出现 ECONNCLOSED
    idleTimeoutMillis: 600_000,
    // 获取连接最多等待 30 秒
    acquireTimeoutMillis: 30_000,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 连接池单例（含自动重连）
// ────────────────────────────────────────────────────────────────────────────
let pool: sql.ConnectionPool | null = null;

/**
 * 获取数据库连接池（单例模式，含自动重连）
 *
 * 问题根因：pool 变量非 null 时不会重新连接，但如果底层 TCP 连接已关闭
 * （idleTimeout / 网络中断 / 热重载），pool.connected 会变为 false，
 * 此时继续使用旧 pool 执行查询会抛出 ECONNCLOSED。
 * 修复：每次获取连接时额外检查 pool.connected，断开则销毁后重建。
 */
export async function getDbConnection(): Promise<sql.ConnectionPool> {
  // 如果已有连接池但连接已断开，先销毁再重建
  if (pool && !pool.connected) {
    console.warn('⚠️ 数据库连接池已断开，正在重新连接…');
    try {
      await pool.close();
    } catch {
      // 忽略关闭时的错误，直接重建
    }
    pool = null;
  }

  if (!pool) {
    try {
      pool = await sql.connect(dbConfig);
      console.log('✅ 数据库连接池创建成功');
    } catch (error) {
      console.error('❌ 数据库连接失败:', error);
      throw error;
    }
  }

  if (!pool) {
    throw new Error('Database connection failed to initialize');
  }

  return pool;
}

/**
 * 关闭数据库连接池
 */
export async function closeDbConnection(): Promise<void> {
  if (pool) {
    try {
      await pool.close();
      pool = null;
      console.log('✅ 数据库连接池已关闭');
    } catch (error) {
      console.error('❌ 关闭数据库连接失败:', error);
      throw error;
    }
  }
}

/**
 * 测试数据库连接
 */
export async function testDbConnection(): Promise<boolean> {
  try {
    const connection = await getDbConnection();
    await connection.request().query('SELECT 1 as test');
    console.log('✅ 连接数据库成功');
    return true;
  } catch (error) {
    console.error('❌ 数据库连接测试失败:', error);
    return false;
  }
}
