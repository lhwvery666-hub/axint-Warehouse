import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";
import { calculateWarrantyStatus, WarrantyStatus, TicketStatus } from "@/lib/enums";
import { getConfig, ConfigKeys } from "@/lib/config";

/**
 * POST /api/tickets/[id]/set-manufacture-date
 * 仓库管理员填写出厂日期并自动判断保修状态
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();
    
    // 从配置读取默认保修期，而非硬编码
    const defaultWarrantyPeriod = await getConfig<number>(
      ConfigKeys.WARRANTY_DEFAULT_PERIOD, 
      12
    );
    
    const { manufactureDate, warrantyPeriodMonths = defaultWarrantyPeriod } = body;

    if (!manufactureDate) {
      return NextResponse.json(
        { success: false, message: "出厂日期为必填项" },
        { status: 400 }
      );
    }

    const pool = await getDbConnection();

    // 检查工单是否存在
    const ticketCheck = await pool
      .request()
      .input("id", id)
      .query("SELECT ID, Status FROM Repair_Tickets WHERE ID = @id");

    if (ticketCheck.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      );
    }

    // 计算保修状态
    const warrantyStatus = calculateWarrantyStatus(manufactureDate, warrantyPeriodMonths);
    
    // 根据保修状态决定下一步流程
    let newStatus = TicketStatus.WARRANTY_CHECKING;
    if (warrantyStatus === WarrantyStatus.IN_WARRANTY) {
      newStatus = TicketStatus.IN_WARRANTY_REPAIR; // 保内直接进入维修
    } else if (warrantyStatus === WarrantyStatus.OUT_OF_WARRANTY) {
      newStatus = TicketStatus.OUT_WARRANTY_REPORT; // 过保需要生成维修报告
    }

    // 检查字段是否存在
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Repair_Tickets' 
        AND COLUMN_NAME IN ('ManufactureDate', 'WarrantyStatus', 'WarrantyPeriodMonths', 'IsWarrantyChecked')
      `);

    const availableColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);
    const hasManufactureDate = availableColumns.includes('ManufactureDate');
    const hasWarrantyStatus = availableColumns.includes('WarrantyStatus');
    const hasWarrantyPeriodMonths = availableColumns.includes('WarrantyPeriodMonths');
    const hasIsWarrantyChecked = availableColumns.includes('IsWarrantyChecked');

    // 构建更新SQL
    const updateParts: string[] = ["Status = @newStatus"];
    const updateRequest = pool.request()
      .input("id", id)
      .input("newStatus", newStatus);

    if (hasManufactureDate) {
      updateParts.push("ManufactureDate = @manufactureDate");
      updateRequest.input("manufactureDate", new Date(manufactureDate));
    }

    if (hasWarrantyStatus) {
      updateParts.push("WarrantyStatus = @warrantyStatus");
      updateRequest.input("warrantyStatus", warrantyStatus);
    }

    if (hasWarrantyPeriodMonths) {
      updateParts.push("WarrantyPeriodMonths = @warrantyPeriodMonths");
      updateRequest.input("warrantyPeriodMonths", warrantyPeriodMonths);
    }

    if (hasIsWarrantyChecked) {
      updateParts.push("IsWarrantyChecked = 1");
    }

    const updateSQL = `
      UPDATE Repair_Tickets 
      SET ${updateParts.join(", ")}
      WHERE ID = @id
    `;

    await updateRequest.query(updateSQL);

    return NextResponse.json({
      success: true,
      message: "出厂日期已填写，保修状态已更新",
      data: {
        warrantyStatus,
        warrantyStatusLabel: warrantyStatus === WarrantyStatus.IN_WARRANTY ? "保内" : "过保",
        newStatus,
        nextStep: warrantyStatus === WarrantyStatus.IN_WARRANTY 
          ? "进入保内维修流程" 
          : "需要生成维修报告并发送给现场人员确认"
      }
    });

  } catch (error: any) {
    console.error("设置出厂日期失败:", error);
    return NextResponse.json(
      { success: false, message: "设置出厂日期时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}
