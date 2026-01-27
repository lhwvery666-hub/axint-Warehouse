import { NextResponse } from "next/server";
import { getDbConnection, closeDbConnection } from "@/lib/db-config";
import * as sql from "mssql";
import * as XLSX from "xlsx";

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
  
  // 跳过第一行（标题行）
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    const rowNumber = i + 1; // Excel 行号（从1开始，第1行是标题）
    
    // 检查必填字段：序列号（B列，索引1）
    const serialNumber = row && row[1] ? String(row[1]).trim() : '';
    
    if (!serialNumber || serialNumber === '') {
      continue; // 跳过没有序列号的行
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
  
  return Array.from(modelSet);
}

/**
 * 自动维护产品目录（插入不重复的规格型号）
 */
async function maintainProductCatalog(
  pool: sql.ConnectionPool,
  models: string[]
): Promise<{ added: number; skipped: number }> {
  if (models.length === 0) {
    return { added: 0, skipped: 0 };
  }

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
    return { added: 0, skipped: models.length };
  }

  // 获取当前最大 DisplayOrder
  const maxOrderResult = await pool
    .request()
    .query(`SELECT MAX(DisplayOrder) as MaxOrder FROM Product_Catalog`);
  
  let currentOrder = (maxOrderResult.recordset[0]?.MaxOrder as number) || 0;

  // 批量插入新规格型号
  const batchSize = 100;
  for (let i = 0; i < newModels.length; i += batchSize) {
    const batch = newModels.slice(i, i + batchSize);
    
    // 构建批量插入 SQL（使用参数化查询防止 SQL 注入）
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
  }

  return { added: newModels.length, skipped: models.length - newModels.length };
}

/**
 * 批量插入或更新设备库存
 */
async function batchUpsertDeviceInventory(
  pool: sql.ConnectionPool,
  records: DeviceRecord[]
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  const batchSize = 500;
  let processedCount = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();

      for (const record of batch) {
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
    } catch (error: any) {
      await transaction.rollback();
      throw new Error(`批量处理失败（第 ${i + 1}-${i + batch.length} 条）: ${error.message}`);
    }
  }

  return processedCount;
}

// POST /api/import/excel
// 处理 Excel 文件上传和导入
export async function POST(request: Request) {

  try {
    // 获取上传的文件
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "未找到上传的文件" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, message: "只支持 .xlsx 或 .xls 格式的 Excel 文件" },
        { status: 400 }
      );
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用 XLSX 解析 Excel 文件
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // 获取第一个工作表
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { success: false, message: "Excel 文件中没有找到工作表" },
        { status: 400 }
      );
    }
    
    const sheet = workbook.Sheets[sheetName];
    
    // 将工作表转换为 JSON 数组（使用数组格式，不自动识别标题行）
    const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
      defval: '',
      raw: false,
      header: 1, // 使用数组格式，不自动识别标题行
    });

    if (jsonData.length === 0) {
      return NextResponse.json(
        { success: false, message: "Excel 文件中没有数据" },
        { status: 400 }
      );
    }

    // 调试：输出第一行的列名，帮助排查问题
    if (jsonData.length > 0) {
      const firstRow = jsonData[0] as any;
      const columnNames = Object.keys(firstRow);
      console.log('📋 Excel 文件列名:', columnNames);
      console.log('📋 第一行数据示例:', firstRow);
    }

    // 验证并转换数据
    const validRecords = validateAndTransformData(jsonData);

    if (validRecords.length === 0) {
      return NextResponse.json(
        { success: false, message: "没有有效的数据记录（所有行都缺少序列号）" },
        { status: 400 }
      );
    }

    // 连接数据库
    const pool = await getDbConnection();

    // 提取不重复的规格型号
    const uniqueModels = extractUniqueModels(validRecords);

    // 自动维护产品目录
    const catalogResult = await maintainProductCatalog(pool, uniqueModels);

    // 批量插入/更新设备库存
    const processedCount = await batchUpsertDeviceInventory(pool, validRecords);

    return NextResponse.json({
      success: true,
      message: "Excel 导入成功",
      stats: {
        totalRows: jsonData.length,
        validRecords: validRecords.length,
        skippedRows: jsonData.length - validRecords.length,
        modelsAdded: catalogResult.added,
        modelsSkipped: catalogResult.skipped,
        devicesProcessed: processedCount,
      },
    });
  } catch (error: any) {
    console.error("Excel 导入失败:", error);
    const errorMessage = error?.message || "未知错误";
    return NextResponse.json(
      {
        success: false,
        message: `导入过程中发生错误: ${errorMessage}`,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
