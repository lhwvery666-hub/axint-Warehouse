import sql from 'mssql';
import { getDbConnection } from '../lib/db-config';

/**
 * 添加签字照片查看追踪字段
 * 用于记录维修人员是否已查看签字照片，实现责任区分
 */
async function addPhotoViewedTracking() {
  console.log('🔄 开始添加签字照片查看追踪字段...\n');

  try {
    const pool = await getDbConnection();

    // 1. 检查 SignedPhotoViewedBy 字段是否存在
    const checkViewedByColumn = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Repair_Tickets' 
      AND COLUMN_NAME = 'SignedPhotoViewedBy'
    `);

    if (checkViewedByColumn.recordset.length === 0) {
      console.log('✅ 添加 SignedPhotoViewedBy 字段（记录查看人）');
      await pool.request().query(`
        ALTER TABLE Repair_Tickets
        ADD SignedPhotoViewedBy NVARCHAR(100) NULL
      `);
      
      // 添加字段说明
      await pool.request().query(`
        EXEC sp_addextendedproperty 
        @name = N'MS_Description', 
        @value = N'签字照片查看人（维修人员ID）', 
        @level0type = N'SCHEMA', @level0name = 'dbo',
        @level1type = N'TABLE', @level1name = 'Repair_Tickets',
        @level2type = N'COLUMN', @level2name = 'SignedPhotoViewedBy'
      `);
      console.log('   字段说明已添加');
    } else {
      console.log('ℹ️  SignedPhotoViewedBy 字段已存在，跳过');
    }

    // 2. 检查 SignedPhotoViewedAt 字段是否存在
    const checkViewedAtColumn = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Repair_Tickets' 
      AND COLUMN_NAME = 'SignedPhotoViewedAt'
    `);

    if (checkViewedAtColumn.recordset.length === 0) {
      console.log('✅ 添加 SignedPhotoViewedAt 字段（记录查看时间）');
      await pool.request().query(`
        ALTER TABLE Repair_Tickets
        ADD SignedPhotoViewedAt DATETIME NULL
      `);
      
      // 添加字段说明
      await pool.request().query(`
        EXEC sp_addextendedproperty 
        @name = N'MS_Description', 
        @value = N'签字照片查看时间', 
        @level0type = N'SCHEMA', @level0name = 'dbo',
        @level1type = N'TABLE', @level1name = 'Repair_Tickets',
        @level2type = N'COLUMN', @level2name = 'SignedPhotoViewedAt'
      `);
      console.log('   字段说明已添加');
    } else {
      console.log('ℹ️  SignedPhotoViewedAt 字段已存在，跳过');
    }

    // 3. 检查 SignedPhotoModifyRequest 字段是否存在
    const checkModifyRequestColumn = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Repair_Tickets' 
      AND COLUMN_NAME = 'SignedPhotoModifyRequest'
    `);

    if (checkModifyRequestColumn.recordset.length === 0) {
      console.log('✅ 添加 SignedPhotoModifyRequest 字段（记录修改申请）');
      await pool.request().query(`
        ALTER TABLE Repair_Tickets
        ADD SignedPhotoModifyRequest NVARCHAR(MAX) NULL
      `);
      
      // 添加字段说明
      await pool.request().query(`
        EXEC sp_addextendedproperty 
        @name = N'MS_Description', 
        @value = N'签字照片修改申请记录（JSON格式）', 
        @level0type = N'SCHEMA', @level0name = 'dbo',
        @level1type = N'TABLE', @level1name = 'Repair_Tickets',
        @level2type = N'COLUMN', @level2name = 'SignedPhotoModifyRequest'
      `);
      console.log('   字段说明已添加');
    } else {
      console.log('ℹ️  SignedPhotoModifyRequest 字段已存在，跳过');
    }

    console.log('\n✅ 签字照片查看追踪字段添加完成！');
    console.log('\n📋 已添加的字段：');
    console.log('   - SignedPhotoViewedBy: 记录查看人（维修人员ID）');
    console.log('   - SignedPhotoViewedAt: 记录查看时间');
    console.log('   - SignedPhotoModifyRequest: 修改申请记录（JSON）');

  } catch (error: any) {
    console.error('❌ 添加字段失败:', error.message);
    throw error;
  }
}

// 执行脚本
addPhotoViewedTracking()
  .then(() => {
    console.log('\n🎉 脚本执行成功！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 脚本执行失败:', error);
    process.exit(1);
  });
