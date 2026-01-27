import * as sql from 'mssql';

// SQL Server 数据库连接配置
export const dbConfig: sql.config = {
  server: 'localhost',
  database: 'AxinRepairDB',
  user: 'AxinUser',
  password: 'AxinPassword2026!',
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true, // 必须开启这个，否则本地连接会报错
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// 创建数据库连接池
let pool: sql.ConnectionPool | null = null;

/**
 * 获取数据库连接池（单例模式）
 */
export async function getDbConnection(): Promise<sql.ConnectionPool> {
  if (!pool) {
    try {
      pool = await sql.connect(dbConfig);
      console.log('✅ 数据库连接池创建成功');
    } catch (error) {
      console.error('❌ 数据库连接失败:', error);
      throw error;
    }
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
    // 执行一个简单的查询来测试连接
    const result = await connection.request().query('SELECT 1 as test');
    console.log('✅ 连接数据库成功');
    return true;
  } catch (error) {
    console.error('❌ 数据库连接测试失败:', error);
    return false;
  }
}
