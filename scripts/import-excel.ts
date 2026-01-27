import * as XLSX from 'xlsx';
import * as sql from 'mssql';
import * as path from 'path';
import * as fs from 'fs';
import { dbConfig } from '../lib/db-config';

// Excel 列名映射（按列索引读取）
interface ExcelRow {
  [key: string]: any; // 允许任意列名
}

// 数据库字段接口
interface DeviceRecord {
  MaterialCode: string;
  SerialNumber: string;
  DeviceName: string;
  ModelName: string;
  Warehouse: string;
  Status: string;
}

/**
 * 读取并解析 Excel 文件（按列索引读取）
 */
function readExcelFile(filePath: string): ExcelRow[] {
  try {
    console.log(`📖 正在读取 Excel 文件: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    // 使用 XLSX.readFile 读取文件
    const workbook = XLSX.readFile(filePath);
    
    // 获取第一个工作表
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('Excel 文件中没有找到工作表');
    }
    
    const sheet = workbook.Sheets[sheetName];
    
    // 将工作表转换为 JSON 数组（第一行作为标题行）
    const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
      defval: '', // 空单元格的默认值
      raw: false, // 不保留原始值，转换为字符串
      header: 1, // 使用数组格式，不自动识别标题行
    });
    
    console.log(`✅ 成功读取 ${jsonData.length} 行数据（包含标题行）`);
    return jsonData;
  } catch (error: any) {
    console.error('❌ 读取 Excel 文件失败:', error.message);
    throw error;
  }
}

/**
 * 验证并转换数据（按列索引读取）
 * A列(0) -> MaterialCode
 * B列(1) -> SerialNumber
 * C列(2) -> DeviceName
 * D列(3) -> ModelName
 * I列(8) -> Warehouse
 * M列(12) -> Status
 */
function validateAndTransformData(rows: ExcelRow[]): DeviceRecord[] {
  const validRecords: DeviceRecord[] = [];
  let skippedCount = 0;

  // 跳过第一行（标题行）
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    const rowNumber = i + 1; // Excel 行号（从1开始，第1行是标题）

    // 检查必填字段：序列号（B列，索引1）
    const serialNumber = row && row[1] ? String(row[1]).trim() : '';
    
    if (!serialNumber || serialNumber === '') {
      console.warn(`⚠️  第 ${rowNumber} 行：缺少序列号，已跳过`);
      skippedCount++;
      continue;
    }

    // 构建记录（按列索引读取）
    const record: DeviceRecord = {
      MaterialCode: row && row[0] ? String(row[0]).trim() : '', // A列：物料代码
      SerialNumber: serialNumber, // B列：序列号
      DeviceName: row && row[2] ? String(row[2]).trim() : '', // C列：物料名称
      ModelName: row && row[3] ? String(row[3]).trim() : '', // D列：规格型号
      Warehouse: row && row[8] ? String(row[8]).trim() : '', // I列：仓库名称
      Status: row && row[12] ? String(row[12]).trim() : '', // M列：序列号状态
    };

    validRecords.push(record);
  }

  console.log(`✅ 数据验证完成：有效记录 ${validRecords.length} 条，跳过 ${skippedCount} 条`);
  return validRecords;
}

/**
 * 提取不重复的规格型号
 */
function extractUniqueModels(records: DeviceRecord[]): string[] {
  const modelSet = new Set<string>();
  
  for (const record of records) {
    if (record.ModelName && record.ModelName.trim() !== '') {
      modelSet.add(record.ModelName.trim());
    }
  }
  
  const uniqueModels = Array.from(modelSet);
  console.log(`📋 提取到 ${uniqueModels.length} 个不重复的规格型号`);
  return uniqueModels;
}

/**
 * 自动维护产品目录（插入不重复的规格型号）
 */
async function maintainProductCatalog(
  pool: sql.ConnectionPool,
  models: string[]
): Promise<void> {
  if (models.length === 0) {
    console.log('ℹ️  没有需要维护的规格型号');
    return;
  }

  try {
    console.log(`🔄 开始维护产品目录...`);
    
    // 查询现有的规格型号（使用 ModelName 字段）
    const existingResult = await pool
      .request()
      .query(`SELECT ModelName FROM Product_Catalog WHERE ModelName IS NOT NULL`);
    
    const existingModels = new Set(
      existingResult.recordset.map((row: any) => row.ModelName?.trim().toLowerCase() || '')
    );

    // 找出需要插入的新规格型号
    const newModels = models.filter(
      (model) => !existingModels.has(model.trim().toLowerCase())
    );

    if (newModels.length === 0) {
      console.log('ℹ️  所有规格型号已存在于产品目录中');
      return;
    }

    console.log(`📝 准备插入 ${newModels.length} 个新规格型号到产品目录`);

    // 获取当前最大 DisplayOrder
    const maxOrderResult = await pool
      .request()
      .query(`SELECT MAX(DisplayOrder) as MaxOrder FROM Product_Catalog`);
    
    let currentOrder = (maxOrderResult.recordset[0]?.MaxOrder as number) || 0;

    // 批量插入新规格型号
    const batchSize = 100;
    for (let i = 0; i < newModels.length; i += batchSize) {
      const batch = newModels.slice(i, i + batchSize);
      
      for (const model of batch) {
        currentOrder++;
        await pool
          .request()
          .input('ModelName', sql.NVarChar, model)
          .input('DisplayOrder', sql.Int, currentOrder)
          .query(`
            INSERT INTO Product_Catalog (ModelName, DisplayOrder)
            VALUES (@ModelName, @DisplayOrder)
          `);
      }

      console.log(`  ✅ 已插入 ${Math.min(i + batchSize, newModels.length)}/${newModels.length} 个规格型号`);
    }

    console.log(`✅ 产品目录维护完成，新增 ${newModels.length} 个规格型号`);
  } catch (error: any) {
    console.error('❌ 维护产品目录失败:', error.message);
    throw error;
  }
}

/**
 * 批量插入或更新设备库存（使用 upsert 逻辑，以 SerialNumber 为唯一键）
 */
async function batchUpsertDeviceInventory(
  pool: sql.ConnectionPool,
  records: DeviceRecord[]
): Promise<void> {
  if (records.length === 0) {
    console.log('ℹ️  没有需要处理的设备记录');
    return;
  }

  try {
    console.log(`🔄 开始批量处理设备库存（共 ${records.length} 条）...`);

    const batchSize = 500;
    let processedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const transaction = new sql.Transaction(pool);
      
      try {
        await transaction.begin();

        for (const record of batch) {
          // 使用 MERGE 语句实现 UPSERT（如果存在则更新，不存在则插入）
          const request = new sql.Request(transaction);
          
          await request
            .input('MaterialCode', sql.NVarChar, record.MaterialCode || '')
            .input('SerialNumber', sql.NVarChar, record.SerialNumber)
            .input('DeviceName', sql.NVarChar, record.DeviceName || '')
            .input('ModelName', sql.NVarChar, record.ModelName || '')
            .input('Warehouse', sql.NVarChar, record.Warehouse || '')
            .input('Status', sql.NVarChar, record.Status || '')
            .query(`
              MERGE Device_Inventory AS target
              USING (SELECT @SerialNumber AS SerialNumber) AS source
              ON target.SerialNumber = source.SerialNumber
              WHEN MATCHED THEN
                UPDATE SET
                  MaterialCode = @MaterialCode,
                  DeviceName = @DeviceName,
                  ModelName = @ModelName,
                  Warehouse = @Warehouse,
                  Status = @Status
              WHEN NOT MATCHED THEN
                INSERT (MaterialCode, SerialNumber, DeviceName, ModelName, Warehouse, Status)
                VALUES (@MaterialCode, @SerialNumber, @DeviceName, @ModelName, @Warehouse, @Status);
            `);
        }

        await transaction.commit();
        processedCount += batch.length;
        console.log(`  ✅ 已处理 ${processedCount}/${records.length} 条记录...`);
      } catch (error: any) {
        await transaction.rollback();
        console.error(`❌ 批量处理失败（第 ${i + 1}-${i + batch.length} 条）:`, error.message);
        throw error;
      }
    }

    console.log(`✅ 设备库存批量处理完成，共处理 ${processedCount} 条记录`);
  } catch (error: any) {
    console.error('❌ 批量处理设备库存失败:', error.message);
    throw error;
  }
}

/**
 * 主函数：执行 Excel 导入流程
 */
async function main() {
  const excelFilePath = path.join(process.cwd(), 'import_data.xlsx');
  
  console.log('🚀 开始执行 Excel 批量导入...\n');
  console.log(`📁 文件路径: ${excelFilePath}\n`);

  let pool: sql.ConnectionPool | null = null;

  try {
    // 步骤 A：读取并解析 Excel
    console.log('='.repeat(50));
    console.log('步骤 A：读取并解析 Excel');
    console.log('='.repeat(50));
    const excelRows = readExcelFile(excelFilePath);
    const validRecords = validateAndTransformData(excelRows);

    if (validRecords.length === 0) {
      console.log('⚠️  没有有效数据可导入，程序退出');
      return;
    }

    // 连接数据库
    console.log('\n' + '='.repeat(50));
    console.log('连接数据库...');
    console.log('='.repeat(50));
    pool = await sql.connect(dbConfig);
    console.log('✅ 数据库连接成功\n');

    // 提取不重复的规格型号
    const uniqueModels = extractUniqueModels(validRecords);

    // 步骤 B：批量写入 SQL Server
    console.log('\n' + '='.repeat(50));
    console.log('步骤 B：批量写入 SQL Server');
    console.log('='.repeat(50));

    // B1: 自动维护产品目录
    console.log('\n📦 子步骤 B1：维护产品目录');
    await maintainProductCatalog(pool, uniqueModels);

    // B2: 批量插入/更新设备库存
    console.log('\n📦 子步骤 B2：批量处理设备库存');
    await batchUpsertDeviceInventory(pool, validRecords);

    console.log('\n' + '='.repeat(50));
    console.log('✅ Excel 批量导入完成！');
    console.log('='.repeat(50));
  } catch (error: any) {
    console.error('\n❌ 导入过程中发生错误:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    if (pool) {
      try {
        await pool.close();
        console.log('\n✅ 数据库连接已关闭');
      } catch (error: any) {
        console.error('⚠️  关闭数据库连接时出错:', error.message);
      }
    }
  }
}

// 执行主函数
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 程序执行失败:', error);
    process.exit(1);
  });
}

export { main };
