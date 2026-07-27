import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";

/**
 * GET /api/tickets/export-excel
 * 导出Excel格式的维修工单数据
 * 按序列号分行，无序列号的产品也会单独一行
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');

    const pool = await getDbConnection();

    // 构建查询条件
    const conditions: string[] = ["Status != 'Deleted'"];
    const queryRequest = pool.request();

    if (startDate) {
      conditions.push("ReportTime >= @startDate");
      queryRequest.input('startDate', new Date(startDate));
    }

    if (endDate) {
      conditions.push("ReportTime <= @endDate");
      queryRequest.input('endDate', new Date(endDate));
    }

    if (status && status !== 'all') {
      conditions.push("Status = @status");
      queryRequest.input('status', status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询所有工单数据
    const result = await queryRequest.query(`
      SELECT 
        ID,
        WorkOrderNumber,
        ReportTime,
        SubmitDate,
        ContactInfo,
        COALESCE(NULLIF(ProjectLocation,''), NULLIF(ProjectName,''), NULLIF(ClientName,''), '') AS ProjectName,
        Category,
        ModelName,
        Quantity,
        ProductSN,
        FaultDescription,
        MaterialCode,
        DeviceName,
        FullSpec,
        FaultPoint,
        RepairCost,
        ManufactureDate,
        FactoryRepairDate,
        FactoryTrackingNum,
        SupplierName,
        IsChargeable,
        ClientName,
        IsInvoiced,
        ReceivedDate,
        FactoryShipDate,
        ReturnDate,
        ReturnQuantity,
        ReturnTrackingNum,
        Status,
        WarrantyStatus,
        RepairResult,
        CASE WHEN EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'ArrivalDate'
        ) THEN ArrivalDate ELSE NULL END AS ArrivalDate
      FROM Repair_Tickets
      ${whereClause}
      ORDER BY ReportTime DESC
    `);

    const tickets = result.recordset;

    // 处理数据：按序列号分行
    const exportData: any[] = [];

    for (const ticket of tickets) {
      const productSN = ticket.ProductSN || '';
      const quantity = ticket.Quantity || 1;

      // 如果有序列号，按逗号或分号分割
      if (productSN && productSN !== 'PENDING' && productSN.trim() !== '') {
        const serialNumbers = productSN.split(/[,;，；\n]/).map((sn: string) => sn.trim()).filter((sn: string) => sn);
        
        // 每个序列号一行
        for (const sn of serialNumbers) {
          exportData.push(createExportRow(ticket, sn, 1));
        }
      } else {
        // 无序列号的产品，使用数量字段
        exportData.push(createExportRow(ticket, '', quantity));
      }
    }

    // 构建Excel数据结构
    const excelData = {
      headers: [
        // 现场人员
        '报交日期',
        '发出快递单号',
        '寄件人地址',
        '联系人及电话',
        '项目/客户名称',
        '产品名称',
        '型号',
        '数量',
        '产品序列号',
        '故障描述',
        
        // 维修人员
        '物料代码',
        '物料名称',
        '规格型号',
        '故障点',
        '收费金额',
        '返厂维修日期',
        '返厂维修快递单号',
        '供应商名称',
        
        // 管理员
        '是否收费',
        '客户名称',
        '是否开票',
        
        // 仓库管理员
        '收到日期',
        '到货日期',
        '出厂日期',
        '返还客户日期',
        '返还客户数量',
        '返还客户快递单号',
      ],
      rows: exportData
    };

    return NextResponse.json({
      success: true,
      data: excelData,
      totalRows: exportData.length,
      message: `成功导出 ${exportData.length} 条记录`
    });

  } catch (error: any) {
    console.error("导出Excel失败:", error);
    return NextResponse.json(
      { success: false, message: "导出Excel时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * 创建导出行数据
 */
function createExportRow(ticket: any, serialNumber: string, quantity: number): any[] {
  return [
    // 现场人员
    formatDate(ticket.SubmitDate),
    ticket.TrackingNumber_In || '',
    ticket.SenderAddress || '',
    ticket.ContactInfo || '',
    ticket.ProjectName || '',
    ticket.Category || '',
    ticket.ModelName || '',
    quantity,
    serialNumber,
    ticket.FaultDescription || '',
    
    // 维修人员
    ticket.MaterialCode || '',
    ticket.DeviceName || '',
    ticket.FullSpec || '',
    ticket.FaultPoint || '',
    ticket.RepairCost || '',
    formatDate(ticket.FactoryRepairDate),
    ticket.FactoryTrackingNum || '',
    ticket.SupplierName || '',
    
    // 管理员
    ticket.IsChargeable ? '是' : '否',
    ticket.ClientName || '',
    ticket.IsInvoiced ? '是' : '否',
    
    // 仓库管理员
    formatDate(ticket.ReceivedDate),
    formatDateCST(ticket.ArrivalDate),
    formatDate(ticket.FactoryShipDate),
    formatDate(ticket.ReturnDate),
    ticket.ReturnQuantity || '',
    ticket.ReturnTrackingNum || '',
  ];
}

/**
 * 格式化日期（UTC）
 */
function formatDate(date: any): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/**
 * 格式化日期（东八区，避免时区偏差）
 */
function formatDateCST(date: any): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const cst = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return cst.toISOString().split('T')[0];
}
