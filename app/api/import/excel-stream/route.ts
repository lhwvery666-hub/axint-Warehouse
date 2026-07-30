import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils";
import { UserRole } from "@/lib/enums";

// Excel 列名映射（按列索引读取）
interface ExcelRow {
  [key: string]: any;
}

// 数据库字段接口
interface DeviceRecord {
  materialCode: string;
  serialNumber: string;
  deviceName: string;
  modelName: string;
  location: string;
  status: string;
}

/**
 * 发送进度事件
 */
function sendProgress(encoder: TextEncoder, controller: ReadableStreamDefaultController, data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(message));
}

/**
 * 验证并转换数据
 */
function validateAndTransformData(rows: ExcelRow[]): DeviceRecord[] {
  const validRecords: DeviceRecord[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    const serialNumber = row && row[1] ? String(row[1]).trim() : '';
    
    if (!serialNumber || serialNumber === '') {
      continue;
    }
    
    const record: DeviceRecord = {
      materialCode: row && row[0] ? String(row[0]).trim() : '',
      serialNumber: serialNumber,
      deviceName: row && row[2] ? String(row[2]).trim() : '',
      modelName: row && row[3] ? String(row[3]).trim() : '',
      location: row && row[8] ? String(row[8]).trim() : '',
      status: row && row[12] ? String(row[12]).trim() : '',
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
 * 自动维护产品目录（使用 Prisma ORM，带进度）
 */
async function maintainProductCatalog(
  models: string[],
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController
): Promise<{ added: number; skipped: number }> {
  if (models.length === 0) {
    return { added: 0, skipped: 0 };
  }

  sendProgress(encoder, controller, {
    stage: 'catalog',
    message: '正在检查产品目录...',
    progress: 0,
    total: models.length
  });

  const existingProducts = await prisma.product_Catalog.findMany({
    select: { modelName: true }
  });
  
  const existingModels = new Set(
    existingProducts.map((p) => p.modelName.trim().toLowerCase())
  );

  const newModels = models.filter(
    (model) => !existingModels.has(model.trim().toLowerCase())
  );

  if (newModels.length === 0) {
    sendProgress(encoder, controller, {
      stage: 'catalog',
      message: '所有型号已存在于产品目录',
      progress: models.length,
      total: models.length
    });
    return { added: 0, skipped: models.length };
  }

  let addedCount = 0;
  for (let i = 0; i < newModels.length; i++) {
    const model = newModels[i];
    try {
      await prisma.product_Catalog.create({
        data: {
          category: '未分类',
          subCategory: '未分类',
          modelName: model,
          modelCode: `AUTO-${Date.now()}-${addedCount}`,
          description: `从 Excel 自动导入: ${model}`,
          manufacturer: '爱克信',
          defaultWarrantyMonths: 12,
          isActive: true
        }
      });
      addedCount++;

      // 每 5 个型号发送一次进度
      if (addedCount % 5 === 0 || addedCount === newModels.length) {
        sendProgress(encoder, controller, {
          stage: 'catalog',
          message: `正在添加产品型号 ${addedCount}/${newModels.length}`,
          progress: addedCount,
          total: newModels.length
        });
      }
    } catch (error: any) {
      if (error.code !== 'P2002') {
        console.error(`插入型号失败: ${model}`, error.message);
      }
    }
  }

  return { added: addedCount, skipped: models.length - addedCount };
}

/**
 * 批量插入或更新设备库存（使用 Prisma ORM，带进度）
 */
async function batchUpsertDeviceInventory(
  records: DeviceRecord[],
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  let processedCount = 0;
  const batchSize = 100; // 每批处理 100 条

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      await prisma.device_Inventory.upsert({
        where: { serialNumber: record.serialNumber },
        update: {
          materialCode: record.materialCode || null,
          deviceName: record.deviceName || null,
          modelName: record.modelName || null,
          location: record.location || null,
          status: record.status || null,
          updatedAt: new Date()
        },
        create: {
          serialNumber: record.serialNumber,
          materialCode: record.materialCode || null,
          deviceName: record.deviceName || null,
          modelName: record.modelName || null,
          location: record.location || null,
          status: record.status || null
        }
      });
      processedCount++;

      // 每处理 batchSize 条或到达末尾时发送进度
      if (processedCount % batchSize === 0 || processedCount === records.length) {
        const percentage = Math.floor((processedCount / records.length) * 100);
        sendProgress(encoder, controller, {
          stage: 'devices',
          message: `正在导入设备 ${processedCount}/${records.length}`,
          progress: processedCount,
          total: records.length,
          percentage
        });
      }
    } catch (error: any) {
      console.error(`处理记录失败（序列号: ${record.serialNumber}）:`, error.message);
    }
  }

  return processedCount;
}

// POST /api/import/excel-stream
// 处理 Excel 文件上传和导入（流式响应，带进度）
export async function POST(request: Request) {
  const authResult = await checkUserRole([UserRole.ADMIN]);
  if (isErrorResponse(authResult)) return authResult;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 获取上传的文件
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
          sendProgress(encoder, controller, {
            stage: 'error',
            message: '未找到上传的文件'
          });
          controller.close();
          return;
        }

        // 验证文件类型
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
          sendProgress(encoder, controller, {
            stage: 'error',
            message: '只支持 .xlsx 或 .xls 格式的 Excel 文件'
          });
          controller.close();
          return;
        }

        sendProgress(encoder, controller, {
          stage: 'parsing',
          message: '正在解析 Excel 文件...',
          progress: 0,
          total: 100
        });

        // 读取文件内容
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 使用 XLSX 解析 Excel 文件
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          sendProgress(encoder, controller, {
            stage: 'error',
            message: 'Excel 文件中没有找到工作表'
          });
          controller.close();
          return;
        }
        
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
          defval: '',
          raw: false,
          header: 1,
        });

        if (jsonData.length === 0) {
          sendProgress(encoder, controller, {
            stage: 'error',
            message: 'Excel 文件中没有数据'
          });
          controller.close();
          return;
        }

        sendProgress(encoder, controller, {
          stage: 'parsing',
          message: `已解析 ${jsonData.length} 行数据`,
          progress: 100,
          total: 100
        });

        // 验证并转换数据
        sendProgress(encoder, controller, {
          stage: 'validating',
          message: '正在验证数据...',
          progress: 0,
          total: 100
        });

        const validRecords = validateAndTransformData(jsonData);

        if (validRecords.length === 0) {
          sendProgress(encoder, controller, {
            stage: 'error',
            message: '没有有效的数据记录（所有行都缺少序列号）'
          });
          controller.close();
          return;
        }

        sendProgress(encoder, controller, {
          stage: 'validating',
          message: `验证完成，有效记录 ${validRecords.length} 条`,
          progress: 100,
          total: 100
        });

        // 提取不重复的规格型号
        const uniqueModels = extractUniqueModels(validRecords);

        // 自动维护产品目录
        const catalogResult = await maintainProductCatalog(uniqueModels, encoder, controller);

        // 批量插入/更新设备库存
        const processedCount = await batchUpsertDeviceInventory(validRecords, encoder, controller);

        // 发送完成事件
        sendProgress(encoder, controller, {
          stage: 'complete',
          message: 'Excel 导入成功',
          stats: {
            totalRows: jsonData.length,
            validRecords: validRecords.length,
            skippedRows: jsonData.length - validRecords.length - 1,
            modelsAdded: catalogResult.added,
            modelsSkipped: catalogResult.skipped,
            devicesProcessed: processedCount,
          }
        });

        controller.close();
        await prisma.$disconnect();

      } catch (error: any) {
        console.error("Excel 导入失败:", error);
        sendProgress(encoder, controller, {
          stage: 'error',
          message: `导入过程中发生错误: ${error.message || '未知错误'}`
        });
        controller.close();
        await prisma.$disconnect();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
