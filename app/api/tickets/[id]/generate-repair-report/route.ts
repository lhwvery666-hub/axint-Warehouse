import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";
import { TicketStatus } from "@/lib/enums";
import { getConfig, ConfigKeys } from "@/lib/config";

/**
 * POST /api/tickets/[id]/generate-repair-report
 * 生成维修报告（过保产品需要）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();
    const { 
      repairResult,        // 维修结果：Repaired/NeedReplacement/Unrepairable
      faultPoint,          // 故障点
      repairCost,          // 维修费用
      repairNotes,         // 维修备注
      supplierName,        // 供应商名称（如需返厂）
    } = body;

    if (!repairResult) {
      return NextResponse.json(
        { success: false, message: "维修结果为必填项" },
        { status: 400 }
      );
    }

    const pool = await getDbConnection();

    // 检查工单是否存在
    const ticketResult = await pool
      .request()
      .input("id", id)
      .query(`
        SELECT 
          ID, Status, DeviceSN, ModelName, FaultDescription, 
          ProjectName, Category, WarrantyStatus
        FROM Repair_Tickets 
        WHERE ID = @id
      `);

    if (ticketResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      );
    }

    const ticket = ticketResult.recordset[0];

    // 从配置读取公司信息，而非硬编码
    const companyName = await getConfig<string>(ConfigKeys.SYSTEM_COMPANY_NAME, '公司名称');
    const supportPhone = await getConfig<string>(ConfigKeys.SYSTEM_SUPPORT_PHONE, '');
    const supportEmail = await getConfig<string>(ConfigKeys.SYSTEM_SUPPORT_EMAIL, '');

    // 生成维修报告内容（可配置的模板）
    const reportDate = new Date().toISOString().split('T')[0];
    const reportContent = generateReportContent({
      id,
      reportDate,
      ticket,
      repairResult,
      faultPoint,
      repairCost,
      repairNotes,
      supplierName,
      companyName,
      supportPhone,
      supportEmail,
    });

    // 检查字段是否存在
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Repair_Tickets' 
        AND COLUMN_NAME IN (
          'RepairReportGenerated', 'RepairReportDate', 'RepairReportContent',
          'RepairResult', 'FaultPoint', 'RepairCost', 'RepairNotes', 'SupplierName'
        )
      `);

    const availableColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);

    // 构建更新SQL
    const updateParts: string[] = ["Status = @newStatus"];
    const updateRequest = pool.request()
      .input("id", id)
      .input("newStatus", TicketStatus.CUSTOMER_CONFIRM); // 状态改为待客户确认

    if (availableColumns.includes('RepairReportGenerated')) {
      updateParts.push("RepairReportGenerated = 1");
    }

    if (availableColumns.includes('RepairReportDate')) {
      updateParts.push("RepairReportDate = @reportDate");
      updateRequest.input("reportDate", new Date());
    }

    if (availableColumns.includes('RepairReportContent')) {
      updateParts.push("RepairReportContent = @reportContent");
      updateRequest.input("reportContent", reportContent);
    }

    if (availableColumns.includes('RepairResult')) {
      updateParts.push("RepairResult = @repairResult");
      updateRequest.input("repairResult", repairResult);
    }

    if (availableColumns.includes('FaultPoint') && faultPoint) {
      updateParts.push("FaultPoint = @faultPoint");
      updateRequest.input("faultPoint", faultPoint);
    }

    if (availableColumns.includes('RepairCost') && repairCost) {
      updateParts.push("RepairCost = @repairCost");
      updateRequest.input("repairCost", repairCost);
    }

    if (availableColumns.includes('RepairNotes') && repairNotes) {
      updateParts.push("RepairNotes = @repairNotes");
      updateRequest.input("repairNotes", repairNotes);
    }

    if (availableColumns.includes('SupplierName') && supplierName) {
      updateParts.push("SupplierName = @supplierName");
      updateRequest.input("supplierName", supplierName);
    }

    const updateSQL = `
      UPDATE Repair_Tickets 
      SET ${updateParts.join(", ")}
      WHERE ID = @id
    `;

    await updateRequest.query(updateSQL);

    return NextResponse.json({
      success: true,
      message: "维修报告已生成，等待客户确认",
      data: {
        reportContent,
        reportDate,
        nextStep: "请将维修报告发送给现场人员，等待客户签字确认"
      }
    });

  } catch (error: any) {
    console.error("生成维修报告失败:", error);
    return NextResponse.json(
      { success: false, message: "生成维修报告时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * 生成维修报告内容（可配置的模板函数）
 * 将来可以从数据库读取模板，实现完全可配置
 */
function generateReportContent(params: {
  id: string;
  reportDate: string;
  ticket: any;
  repairResult: string;
  faultPoint?: string;
  repairCost?: number;
  repairNotes?: string;
  supplierName?: string;
  companyName: string;
  supportPhone: string;
  supportEmail: string;
}): string {
  const {
    id,
    reportDate,
    ticket,
    repairResult,
    faultPoint,
    repairCost,
    repairNotes,
    supplierName,
    companyName,
    supportPhone,
    supportEmail,
  } = params;

  const repairResultText = 
    repairResult === 'Repaired' ? '可维修' : 
    repairResult === 'NeedReplacement' ? '需更换' : 
    '无法维修';

  return `
${companyName}
维修报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

工单编号：${id}
报告日期：${reportDate}
设备序列号：${ticket.DeviceSN || 'N/A'}
设备型号：${ticket.ModelName || 'N/A'}
产品名称：${ticket.Category || 'N/A'}
项目名称：${ticket.ProjectName || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

故障描述：
${ticket.FaultDescription || 'N/A'}

故障点：
${faultPoint || '待检测'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

维修结果：${repairResultText}

${repairResult === 'Unrepairable' ? '说明：该设备无法维修，建议报废或更换。' : ''}

${repairCost ? `维修费用：¥${repairCost}` : ''}

${supplierName ? `供应商：${supplierName}` : ''}

维修备注：
${repairNotes || '无'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请客户确认是否同意维修：
□ 同意维修（需支付维修费用）
□ 拒绝维修，产品回寄
□ 拒绝维修，产品不回寄（入库待报废）

客户签字：________________  日期：________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${supportPhone ? `技术支持电话：${supportPhone}` : ''}
${supportEmail ? `技术支持邮箱：${supportEmail}` : ''}
  `.trim();
}
