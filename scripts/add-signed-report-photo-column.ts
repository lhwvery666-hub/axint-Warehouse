/**
 * 数据库迁移脚本：添加签字报告照片字段
 * 用途：现场人员打印报告后签字拍照回传
 * 
 * 运行方式：npx tsx scripts/add-signed-report-photo-column.ts
 */

import { getDbConnection } from '../lib/db-config';
import { DB_FIELDS } from '../lib/enums';

async function addSignedReportPhotoColumn() {
  try {
    console.log('🔧 开始添加签字报告照片字段...');
    const pool = await getDbConnection();

    // 1. 检查字段是否已存在
    const checkQuery = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Repair_Tickets' 
      AND COLUMN_NAME = '${DB_FIELDS.SIGNED_REPORT_PHOTO}'
    `;
    const checkResult = await pool.request().query(checkQuery);

    if (checkResult.recordset.length > 0) {
      console.log('✅ 字段已存在，无需添加');
      return;
    }

    // 2. 添加新字段
    const alterQuery = `
      ALTER TABLE Repair_Tickets
      ADD ${DB_FIELDS.SIGNED_REPORT_PHOTO} NVARCHAR(500) NULL;
    `;
    await pool.request().query(alterQuery);
    console.log(`✅ 成功添加字段: ${DB_FIELDS.SIGNED_REPORT_PHOTO}`);

    // 3. 添加字段注释（如果数据库支持）
    try {
      const commentQuery = `
        EXEC sp_addextendedproperty 
          @name = N'MS_Description', 
          @value = N'签字报告照片路径（现场人员确认后上传）', 
          @level0type = N'SCHEMA', @level0name = N'dbo',
          @level1type = N'TABLE',  @level1name = N'Repair_Tickets',
          @level2type = N'COLUMN', @level2name = N'${DB_FIELDS.SIGNED_REPORT_PHOTO}';
      `;
      await pool.request().query(commentQuery);
      console.log('✅ 成功添加字段注释');
    } catch (commentError) {
      console.warn('⚠️  添加注释失败（可忽略）:', commentError);
    }

    console.log('🎉 迁移完成！');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

// 执行迁移
addSignedReportPhotoColumn()
  .then(() => {
    console.log('✅ 脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
