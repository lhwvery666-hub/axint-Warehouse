import { NextResponse } from 'next/server';
import { testDbConnection } from '@/lib/db-config';

/**
 * GET /api/db/test
 * 测试数据库连接
 */
export async function GET() {
  try {
    const isConnected = await testDbConnection();
    
    if (isConnected) {
      return NextResponse.json(
        { 
          success: true, 
          message: '连接数据库成功',
          timestamp: new Date().toISOString()
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { 
          success: false, 
          message: '数据库连接失败',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('数据库测试错误:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: '数据库连接错误',
        error: error.message || '未知错误',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
