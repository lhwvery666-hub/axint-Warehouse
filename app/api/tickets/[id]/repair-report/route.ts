import { z } from "zod";
import { isSignedRepairReport, mergeRepairReportContent, parseRepairReportContent, sumRepairCosts } from "@/lib/repair-report-policy";
import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils";
import { UserRole, TicketActionType } from "@/lib/enums";
import * as sql from "mssql";

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
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
      return NextResponse.json({ success: false, message: "工单ID无效" }, { status: 400 });
    }
    const pool = await getDbConnection();

    // 查询工单基本信息
    const ticketRequest = pool
      .request()
      .input("id", sql.Int, Number(id));
    const reporterOnly = authResult.normalizedRole === UserRole.REPORTER;
    if (reporterOnly) {
      const reporterUserId = Number(authResult.userId);
      if (!Number.isSafeInteger(reporterUserId) || reporterUserId < 1) {
        return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 });
      }
      ticketRequest.input("reporterUserId", sql.Int, reporterUserId);
    }
    const ticketResult = await ticketRequest.query(`
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
          RepairReportContent,
          SignedReportPhoto,
          ReporterConfirmedAt,
          WarrantyStatus,
          RepairNotes,
          SenderAddress as CustomerAddress,
          ReportedBy as ReporterName
        FROM Repair_Tickets
        WHERE Id = @id ${reporterOnly ? "AND ReportByUserID = @reporterUserId" : ""}
      `);

    if (ticketResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      );
    }

    const ticket = ticketResult.recordset[0];

    const reportContent = parseRepairReportContent(ticket.RepairReportContent);
    const savedItems = z.array(z.object({
      deviceModel: z.string(), quantity: z.number().positive(), serialNumber: z.string(),
      repairContent: z.string(), repairCost: z.number().finite().nonnegative(), improvements: z.string(),
    })).safeParse(reportContent.items);
    const items = savedItems.success ? savedItems.data : [{
      deviceModel: ticket.ModelName || "", quantity: ticket.Quantity || 1, serialNumber: ticket.DeviceSN || "",
      repairContent: ticket.FaultDescription || "", repairCost: ticket.RepairCost || 0,
      improvements: reporterOnly ? "" : ticket.RepairNotes || "",
    }];

    // 计算合计
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = sumRepairCosts(items.map(item => ({ RepairCost: item.repairCost })));

    // 格式化日期
    const formatDate = (date: string | number | Date | null | undefined) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    };

    // 判断是否过保
    const isOutOfWarranty = ticket.WarrantyStatus === 'OutOfWarranty' ? '是' : '否';

    const reportData = {
      ticketId: ticket.Id,
      receiveDate: formatDate(ticket.ReceivedDate),
      repairNumber: ticket.WorkOrderNumber || ticket.Id,
      customerName: ticket.ClientName || '',
      projectName: ticket.ProjectName || '',
      customerAddress: ticket.CustomerAddress || '',
      contactInfo: ticket.ContactInfo || '',
      from: ticket.ReporterName || '',
      isOutOfWarranty,
      items,
      totalQuantity,
      totalCost,
      remarks: typeof reportContent.remarks === "string" ? reportContent.remarks : "",
      reportLocked: isSignedRepairReport(ticket),
    };

    return NextResponse.json({
      success: true,
      data: reportData
    });

  } catch (error: unknown) {
    console.error("获取维修报告数据失败:", error);
    return NextResponse.json(
      { success: false, message: "获取维修报告数据时发生错误" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tickets/[id]/repair-report
 * 更新维修报告内容（维修人员填写）
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkUserRole([UserRole.ADMIN, UserRole.TECHNICIAN]);
  if (isErrorResponse(auth)) return auth;
  let transaction: sql.Transaction | null = null;
  try {
    const id = z.coerce.number().int().positive().safeParse((await params).id);
    const body = z.object({
      items: z.array(z.object({
        deviceModel: z.string().max(200), quantity: z.number().int().positive(), serialNumber: z.string().max(100),
        repairContent: z.string().max(10000), repairCost: z.number().finite().min(0).max(100000000), improvements: z.string().max(10000),
      }).strict()).min(1).max(500),
      remarks: z.string().max(5000).default(""), totalCost: z.number().finite().nonnegative().optional(),
    }).strict().safeParse(await request.json().catch(() => null));
    if (!id.success || !body.success) return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 });
    const pool = await getDbConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const ticketResult = await new sql.Request(transaction).input("id", sql.Int, id.data).query<{
      Id: number; BatchId: string | null; RepairReportContent: string | null; SignedReportPhoto: string | null; ReporterConfirmedAt: Date | null;
    }>(`SELECT [Id], [BatchId], [RepairReportContent], [SignedReportPhoto], [ReporterConfirmedAt]
      FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = @id AND [Status] <> 'Deleted';`);
    const ticket = ticketResult.recordset[0];
    if (!ticket || isSignedRepairReport(ticket)) {
      await transaction.rollback(); transaction = null;
      return NextResponse.json({ success: false, message: ticket ? "维修报告已签字确认，不能再修改报告或费用" : "工单不存在" }, { status: ticket ? 409 : 404 });
    }
    const totalCost = sumRepairCosts(body.data.items.map(item => ({ RepairCost: item.repairCost })));
    await new sql.Request(transaction).input("id", sql.Int, id.data)
      .input("content", sql.NVarChar(sql.MAX), mergeRepairReportContent(ticket.RepairReportContent, { items: body.data.items, remarks: body.data.remarks }))
      .input("cost", sql.Decimal(18, 2), totalCost)
      .query(`UPDATE [dbo].[Repair_Tickets] SET [RepairReportContent] = @content, [RepairCost] = @cost, [UpdatedAt] = GETUTCDATE() WHERE [Id] = @id;`);
    await new sql.Request(transaction).input("ticketId", sql.NVarChar(50), String(id.data))
      .input("batchId", sql.NVarChar(100), ticket.BatchId)
      .input("operatorId", sql.Int, Number(auth.userId))
      .input("operatorName", sql.NVarChar(100), auth.realName || auth.username)
      .input("actionType", sql.NVarChar(50), TicketActionType.REPAIR_REPORT_SAVED)
      .query(`INSERT INTO [dbo].[Repair_Ticket_History] ([TicketID], [BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt])
        VALUES (@ticketId, @batchId, @actionType, @operatorId, @operatorName, N'保存签字前维修报告', GETUTCDATE());`);
    await transaction.commit(); transaction = null;
    return NextResponse.json({ success: true, message: "维修报告已保存", data: { totalCost } });
  } catch (error: unknown) {
    if (transaction) { try { await transaction.rollback() } catch {} finally { transaction = null; } }
    console.error("保存维修报告失败:", error);
    return NextResponse.json({ success: false, message: "保存维修报告失败" }, { status: 500 });
  }
}
