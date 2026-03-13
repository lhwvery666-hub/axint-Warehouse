import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// Excel 列名映射（按列索引读取）
interface ExcelRow {
  [key: string]: any; // 允许任意列名
}

// 数据库字段接口
interface DeviceRecord {
  materialCode: string;
  serialNumber: string;
  deviceName: string;
  modelName: string;
  location: string; // 仓库/位置（对应数据库 Location 字段）
  status: string;
}

/**
 * 验证并转换数据（按列索引读取）
 * A列(0) -> MaterialCode
 * B列(1) -> SerialNumber
 * C列(2) -> DeviceName
 * D列(3) -> ModelName
 * I列(8) -> Location (仓库位置)
 * M列(12) -> Status
 */
function validateAndTransformData(rows: ExcelRow[]): DeviceRecord[] {
  const validRecords: DeviceRecord[] = [];
  
  // 跳过第一行（标题行）
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    
    // 检查必填字段：序列号（B列，索引1）
    const serialNumber = row && row[1] ? String(row[1]).trim() : '';
    
    if (!serialNumber || serialNumber === '') {
      continue; // 跳过没有序列号的行
    }
    
    // 构建记录（按列索引读取）
    const record: DeviceRecord = {
      materialCode: row && row[0] ? String(row[0]).trim() : '', // A列：物料代码
      serialNumber: serialNumber, // B列：序列号
      deviceName: row && row[2] ? String(row[2]).trim() : '', // C列：物料名称
      modelName: row && row[3] ? String(row[3]).trim() : '', // D列：规格型号
      location: row && row[8] ? String(row[8]).trim() : '', // I列：仓库位置
      status: row && row[12] ? String(row[12]).trim() : '', // M列：序列号状态
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
    if (record.modelName && record.modelName.trim() !== '') {
      modelSet.add(record.modelName.trim());
    }
  }
  
  return Array.from(modelSet);
}

/**
 * 自动维护产品目录（使用 Prisma ORM）
 */
async function maintainProductCatalog(
  models: string[]
): Promise<{ added: number; skipped: number }> {
  if (models.length === 0) {
    return { added: 0, skipped: 0 };
  }

  // 查询现有的规格型号（使用 Prisma）
  const existingProducts = await prisma.product_Catalog.findMany({
    select: {
      modelName: true
    }
  });
  
  const existingModels = new Set(
    existingProducts.map((p) => p.modelName.trim().toLowerCase())
  );

  // 找出需要插入的新规格型号
  const newModels = models.filter(
    (model) => !existingModels.has(model.trim().toLowerCase())
  );

  if (newModels.length === 0) {
    return { added: 0, skipped: models.length };
  }

  // 批量插入新规格型号（使用 Prisma）
  let addedCount = 0;
  for (const model of newModels) {
    try {
      await prisma.product_Catalog.create({
        data: {
          category: '未分类', // 默认类别
          subCategory: '未分类', // 默认子类别
          modelName: model,
          modelCode: `AUTO-${Date.now()}-${addedCount}`, // 自动生成唯一编码
          description: `从 Excel 自动导入: ${model}`,
          manufacturer: '爱克信',
          defaultWarrantyMonths: 12,
          isActive: true
        }
      });
      addedCount++;
    } catch (error: any) {
      // 如果是重复键错误，跳过
      if (error.code !== 'P2002') {
        console.error(`插入型号失败: ${model}`, error.message);
      }
    }
  }

  return { added: addedCount, skipped: models.length - addedCount };
}

/**
 * 批量插入或更新设备库存（使用 Prisma ORM）
 */
async function batchUpsertDeviceInventory(
  records: DeviceRecord[]
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  let processedCount = 0;

  for (const record of records) {
    try {
      // 使用 Prisma 的 upsert 方法
      await prisma.device_Inventory.upsert({
        where: {
          serialNumber: record.serialNumber
        },
        update: {
          materialCode: record.materialCode || null,
          deviceName: record.deviceName || null,
          modelName: record.modelName || null,
          location: record.location || null, // 修正：使用 location 字段
          status: record.status || null,
          updatedAt: new Date()
        },
        create: {
          serialNumber: record.serialNumber,
          materialCode: record.materialCode || null,
          deviceName: record.deviceName || null,
          modelName: record.modelName || null,
          location: record.location || null, // 修正：使用 location 字段
          status: record.status || null
        }
      });
      processedCount++;
    } catch (error: any) {
      console.error(`处理记录失败（序列号: ${record.serialNumber}）:`, error.message);
      // 继续处理其他记录，不中断整个流程
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

    // 提取不重复的规格型号
    const uniqueModels = extractUniqueModels(validRecords);

    // 自动维护产品目录（使用 Prisma）
    const catalogResult = await maintainProductCatalog(uniqueModels);

    // 批量插入/更新设备库存（使用 Prisma）
    const processedCount = await batchUpsertDeviceInventory(validRecords);

    return NextResponse.json({
      success: true,
      message: "Excel 导入成功",
      stats: {
        totalRows: jsonData.length,
        validRecords: validRecords.length,
        skippedRows: jsonData.length - validRecords.length - 1, // 减去标题行
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
  } finally {
    // Prisma 会自动管理连接池，不需要手动关闭
    await prisma.$disconnect();
  }
}
