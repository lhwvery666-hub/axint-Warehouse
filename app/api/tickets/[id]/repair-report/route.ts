import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils";
import { UserRole } from "@/lib/enums";

/**
 * GET /api/tickets/[id]/repair-report
 * 获取维修报告数据（用于打印）
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES);
  if (isErrorResponse(authResult)) return authResult;

  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const pool = await getDbConnection();

    // 查询工单基本信息
    const ticketResult = await pool
      .request()
      .input("id", id)
      .query(`
        SELECT 
          Id,
          TicketId as WorkOrderNumber,
          ReceivedDate,
          ClientName,
          ProjectName,
          ContactInfo,
          Category,
          ModelName,
          DeviceSN,
          Quantity,
          Problem as FaultDescription,
          RepairCost,
          WarrantyStatus,
          RepairNotes,
          SenderAddress as CustomerAddress,
          ReportedBy as ReporterName
        FROM Repair_Tickets
        WHERE Id = @id
      `);

    if (ticketResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      );
    }

    const ticket = ticketResult.recordset[0];

    // 处理序列号（如果有多个，按逗号分割）
    const serialNumbers = ticket.DeviceSN 
      ? ticket.DeviceSN.split(/[,;，；\n]/).map((sn: string) => sn.trim()).filter((sn: string) => sn)
      : [];

    // 构建报告数据项
    const items = [];
    
    if (serialNumbers.length > 0) {
      // 有序列号：每个序列号一行
      for (const sn of serialNumbers) {
        items.push({
          deviceModel: ticket.ModelName || '',
          quantity: 1,
          serialNumber: sn,
          repairContent: ticket.FaultDescription || '',
          repairCost: ticket.RepairCost || 0,
          improvements: ticket.RepairNotes || '',
        });
      }
    } else {
      // 无序列号：使用数量字段
      items.push({
        deviceModel: ticket.ModelName || '',
        quantity: ticket.Quantity || 1,
        serialNumber: '',
        repairContent: ticket.FaultDescription || '',
        repairCost: ticket.RepairCost || 0,
        improvements: ticket.RepairNotes || '',
      });
    }

    // 计算合计
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = items.reduce((sum, item) => sum + (item.repairCost || 0), 0);

    // 格式化日期
    const formatDate = (date: any) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    };

    // 判断是否过保
    const isOutOfWarranty = ticket.WarrantyStatus === 'OutOfWarranty' ? '是' : '否';

    const reportData = {
      ticketId: ticket.ID,
      receiveDate: formatDate(ticket.ReceivedDate),
      repairNumber: ticket.WorkOrderNumber || ticket.ID,
      customerName: ticket.ClientName || '',
      projectName: ticket.ProjectName || '',
      customerAddress: ticket.CustomerAddress || '',
      contactInfo: ticket.ContactInfo || '',
      from: ticket.ReporterName || '',
      isOutOfWarranty,
      items,
      totalQuantity,
      totalCost,
      remarks: '',
    };

    return NextResponse.json({
      success: true,
      data: reportData
    });

  } catch (error: any) {
    console.error("获取维修报告数据失败:", error);
    return NextResponse.json(
      { success: false, message: "获取维修报告数据时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tickets/[id]/repair-report
 * 更新维修报告内容（维修人员填写）
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.TECHNICIAN]);
  if (isErrorResponse(authResult)) return authResult;

  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();
    const { 
      items,           // 维修项目数组
      remarks,         // 备注
      totalCost,       // 总费用
    } = body;

    const pool = await getDbConnection();

    // 检查工单是否存在
    const ticketCheck = await pool
      .request()
      .input("id", id)
      .query("SELECT ID FROM Repair_Tickets WHERE ID = @id");

    if (ticketCheck.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      );
    }

    // 将维修项目保存为JSON（如果字段存在）
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Repair_Tickets' 
        AND COLUMN_NAME IN ('RepairReportContent', 'RepairCost', 'RepairNotes', 'RepairReportGenerated')
      `);

    const availableColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);

    const updateParts: string[] = [];
    const updateRequest = pool.request().input("id", id);

    if (availableColumns.includes('RepairReportContent')) {
      updateParts.push("RepairReportContent = @reportContent");
      updateRequest.input("reportContent", JSON.stringify({ items, remarks }));
    }

    if (availableColumns.includes('RepairCost') && totalCost !== undefined) {
      updateParts.push("RepairCost = @totalCost");
      updateRequest.input("totalCost", totalCost);
    }

    if (availableColumns.includes('RepairNotes') && remarks) {
      updateParts.push("RepairNotes = @remarks");
      updateRequest.input("remarks", remarks);
    }

    if (availableColumns.includes('RepairReportGenerated')) {
      updateParts.push("RepairReportGenerated = 1");
    }

    if (updateParts.length > 0) {
      const updateSQL = `
        UPDATE Repair_Tickets 
        SET ${updateParts.join(", ")}
        WHERE ID = @id
      `;
      await updateRequest.query(updateSQL);
    }

    return NextResponse.json({
      success: true,
      message: "维修报告已更新"
    });

  } catch (error: any) {
    console.error("更新维修报告失败:", error);
    return NextResponse.json(
      { success: false, message: "更新维修报告时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}
