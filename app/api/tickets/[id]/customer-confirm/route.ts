import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";
import { TicketStatus, CustomerConfirmation } from "@/lib/enums";

/**
 * POST /api/tickets/[id]/customer-confirm
 * 现场人员提交客户确认结果
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
      confirmation,      // Agreed/Rejected
      needReturnShip,    // 是否需要回寄（拒修时填写）
      customerSignature, // 客户签字图片路径
    } = body;

    if (!confirmation) {
      return NextResponse.json(
        { success: false, message: "客户确认结果为必填项" },
        { status: 400 }
      );
    }

    // 如果拒修，必须选择是否回寄
    if (confirmation === CustomerConfirmation.REJECTED && needReturnShip === undefined) {
      return NextResponse.json(
        { success: false, message: "拒修时必须选择是否需要回寄" },
        { status: 400 }
      );
    }

    const pool = await getDbConnection();

    // 检查工单是否存在
    const ticketCheck = await pool
      .request()
      .input("id", id)
      .query("SELECT ID, Status, RepairCost FROM Repair_Tickets WHERE ID = @id");

    if (ticketCheck.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      );
    }

    const ticket = ticketCheck.recordset[0];

    // 根据确认结果决定下一步状态
    let newStatus: string;
    let message: string;

    if (confirmation === CustomerConfirmation.AGREED) {
      // 同意维修 -> 进入收费维修流程
      newStatus = TicketStatus.PENDING_PAYMENT; // 待收款
      message = "客户已同意维修，请确认收款后开始维修";
    } else if (confirmation === CustomerConfirmation.REJECTED) {
      if (needReturnShip) {
        // 拒修且需要回寄
        newStatus = TicketStatus.RETURN_UNREPAIRED;
        message = "客户拒绝维修，产品将回寄";
      } else {
        // 拒修且不回寄（入库待报废）
        newStatus = TicketStatus.REJECTED_NO_RETURN;
        message = "客户拒绝维修且不回寄，产品已入库等待报废";
      }
    } else {
      return NextResponse.json(
        { success: false, message: "无效的确认结果" },
        { status: 400 }
      );
    }

    // 检查字段是否存在
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Repair_Tickets' 
        AND COLUMN_NAME IN ('CustomerConfirmation', 'CustomerConfirmDate', 'CustomerSignature', 'NeedReturnShip', 'StorageLocation')
      `);

    const availableColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);

    // 构建更新SQL
    const updateParts: string[] = ["Status = @newStatus"];
    const updateRequest = pool.request()
      .input("id", id)
      .input("newStatus", newStatus);

    if (availableColumns.includes('CustomerConfirmation')) {
      updateParts.push("CustomerConfirmation = @confirmation");
      updateRequest.input("confirmation", confirmation);
    }

    if (availableColumns.includes('CustomerConfirmDate')) {
      updateParts.push("CustomerConfirmDate = @confirmDate");
      updateRequest.input("confirmDate", new Date());
    }

    if (availableColumns.includes('CustomerSignature') && customerSignature) {
      updateParts.push("CustomerSignature = @customerSignature");
      updateRequest.input("customerSignature", customerSignature);
    }

    if (availableColumns.includes('NeedReturnShip') && needReturnShip !== undefined) {
      updateParts.push("NeedReturnShip = @needReturnShip");
      updateRequest.input("needReturnShip", needReturnShip ? 1 : 0);
    }

    // 如果是拒修不回寄，设置入库位置
    if (confirmation === CustomerConfirmation.REJECTED && !needReturnShip && availableColumns.includes('StorageLocation')) {
      updateParts.push("StorageLocation = @storageLocation");
      updateRequest.input("storageLocation", "待报废区");
    }

    const updateSQL = `
      UPDATE Repair_Tickets 
      SET ${updateParts.join(", ")}
      WHERE ID = @id
    `;

    await updateRequest.query(updateSQL);

    return NextResponse.json({
      success: true,
      message,
      data: {
        confirmation,
        newStatus,
        needReturnShip: needReturnShip || false,
        nextStep: confirmation === CustomerConfirmation.AGREED 
          ? "等待收款确认后开始维修" 
          : needReturnShip 
            ? "安排产品回寄" 
            : "产品已入库待报废"
      }
    });

  } catch (error: any) {
    console.error("客户确认失败:", error);
    return NextResponse.json(
      { success: false, message: "客户确认时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}
