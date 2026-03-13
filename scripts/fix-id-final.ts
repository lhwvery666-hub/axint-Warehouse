/**
 * 最终修复方案：为 Repair_Tickets 的 Id 列添加 IDENTITY
 */

import { getDbConnection } from '../lib/db-config'

async function fixIdColumn() {
  console.log('🔧 开始修复 Repair_Tickets 的 Id 列...\n')

  try {
    const pool = await getDbConnection()

    // 1. 检查当前配置
    console.log('📋 检查当前表结构...')
    const checkResult = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMNPROPERTY(OBJECT_ID('Repair_Tickets'), 'Id', 'IsIdentity') as IsIdentity
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'Id'
    `)
    
    console.table(checkResult.recordset)

    if (checkResult.recordset[0]?.IsIdentity === 1) {
      console.log('✅ Id 列已经是自增列，无需修复！')
      return
    }

    console.log('\n⚠️  Id 列不是自增列，开始修复...\n')

    // 2. 检查是否有数据
    const countResult = await pool.request().query(`
      SELECT COUNT(*) as count FROM Repair_Tickets
    `)
    const dataCount = countResult.recordset[0].count
    console.log(`📦 表中有 ${dataCount} 条数据`)

    // 3. 删除临时表（如果存在）
    await pool.request().query(`
      IF OBJECT_ID('Repair_Tickets_Temp', 'U') IS NOT NULL
        DROP TABLE Repair_Tickets_Temp
    `)

    // 4. 创建新表（带IDENTITY）
    console.log('🔨 创建新表结构...')
    await pool.request().query(`
      CREATE TABLE Repair_Tickets_Temp (
        Id INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
        TicketId NVARCHAR(50),
        DeviceSN NVARCHAR(100) NOT NULL,
        ModelName NVARCHAR(200),
        DeviceName NVARCHAR(200),
        Problem NVARCHAR(MAX) DEFAULT '',
        Status NVARCHAR(50) NOT NULL DEFAULT 'created',
        Priority NVARCHAR(20) NOT NULL DEFAULT 'medium',
        Location NVARCHAR(200),
        ReportedBy NVARCHAR(100) DEFAULT '',
        ExpressCompany NVARCHAR(100),
        TrackingNumber NVARCHAR(100),
        DevicePhotos NVARCHAR(MAX),
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2,
        ProjectLocation NVARCHAR(200),
        MaterialCode NVARCHAR(100),
        SenderAddress NVARCHAR(500),
        ContactInfo NVARCHAR(200),
        CourierInfo NVARCHAR(200),
        TrackingNumber_In NVARCHAR(100),
        RepairReportContent NVARCHAR(MAX),
        DevicesList NVARCHAR(MAX),
        DeviceCount INT,
        BatchId NVARCHAR(50)
      )
    `)

    // 5. 复制数据（如果有）
    if (dataCount > 0) {
      console.log('📥 复制数据...')
      await pool.request().query(`
        SET IDENTITY_INSERT Repair_Tickets_Temp ON
      `)

      await pool.request().query(`
        INSERT INTO Repair_Tickets_Temp (
          Id, TicketId, DeviceSN, ModelName, DeviceName, Problem, Status, Priority,
          Location, ReportedBy, ExpressCompany, TrackingNumber, DevicePhotos,
          CreatedAt, UpdatedAt, ProjectLocation, MaterialCode, SenderAddress,
          ContactInfo, CourierInfo, TrackingNumber_In, RepairReportContent,
          DevicesList, DeviceCount, BatchId
        )
        SELECT 
          Id, TicketId, DeviceSN, ModelName, DeviceName, Problem, Status, Priority,
          Location, ReportedBy, ExpressCompany, TrackingNumber, DevicePhotos,
          CreatedAt, UpdatedAt, ProjectLocation, MaterialCode, SenderAddress,
          ContactInfo, CourierInfo, TrackingNumber_In, RepairReportContent,
          DevicesList, DeviceCount, BatchId
        FROM Repair_Tickets
      `)

      await pool.request().query(`
        SET IDENTITY_INSERT Repair_Tickets_Temp OFF
      `)

      console.log('✅ 数据复制完成')
    }

    // 6. 删除旧表
    console.log('🗑️  删除旧表...')
    await pool.request().query(`DROP TABLE Repair_Tickets`)

    // 7. 重命名新表
    console.log('📝 重命名新表...')
    await pool.request().query(`
      EXEC sp_rename 'Repair_Tickets_Temp', 'Repair_Tickets'
    `)

    // 8. 验证结果
    console.log('\n📋 验证结果...')
    const verifyResult = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMNPROPERTY(OBJECT_ID('Repair_Tickets'), 'Id', 'IsIdentity') as IsIdentity
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'Id'
    `)
    
    console.table(verifyResult.recordset)

    if (verifyResult.recordset[0]?.IsIdentity === 1) {
      console.log('\n✅ 修复成功！Id 列现在是自增列！')
      console.log('📝 请重启开发服务器（npm run dev）')
    } else {
      console.log('\n❌ 修复失败，请手动检查')
    }

  } catch (error: any) {
    console.error('\n❌ 修复失败:', error.message)
    console.error('详细错误:', error)
    process.exit(1)
  }
}

fixIdColumn().then(() => process.exit(0))
