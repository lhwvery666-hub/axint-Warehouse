import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/warehouse-factory-transfer-devices
// 仓库内部返厂设备跟进队列：每台设备独立显示，支持不同厂家分批返回。
export async function GET() {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  try {
    const pool = await getDbConnection()
    const result = await pool
      .request()
      .input("pendingFactoryStatus", TicketStatus.PENDING_FACTORY)
      .query(`
        SELECT
          t.[Id] AS [id],
          COALESCE(NULLIF(t.[BatchId], ''), t.[TicketId]) AS [batchId],
          t.[BatchId] AS [sourceBatchId],
          t.[TicketId] AS [ticketId],
          COALESCE(t.[ClientName], t.[ProjectName], '') AS [customerName],
          COALESCE(t.[ProjectName], '') AS [projectName],
          COALESCE(t.[ProjectLocation], '') AS [projectLocation],
          COALESCE(t.[DeviceName], t.[Category], '') AS [category],
          COALESCE(t.[DeviceSN], '') AS [deviceSerials],
          COALESCE(t.[ModelName], di.[ModelName], '') AS [deviceModels],
          COALESCE(t.[Quantity], 1) AS [deviceCount],
          t.[SupplierName] AS [supplierName],
          t.[FactoryTrackingNum] AS [factoryTrackingNum],
          t.[FactoryShipDate] AS [factoryShipDate],
          t.[CreatedAt] AS [createdAt],
          t.[Status] AS [status],
          t.[Status] AS [statuses],
          DATEDIFF(
            DAY,
            COALESCE(t.[FactoryShipDate], t.[UpdatedAt], t.[CreatedAt]),
            GETUTCDATE()
          ) AS [followUpDays]
        FROM [dbo].[Repair_Tickets] t
        LEFT JOIN [dbo].[Device_Inventory] di ON di.[SerialNumber] = t.[DeviceSN]
        WHERE t.[Status] = @pendingFactoryStatus
          AND NULLIF(LTRIM(RTRIM(t.[SignedReportPhoto])), '') IS NOT NULL
        ORDER BY
          COALESCE(t.[FactoryShipDate], t.[UpdatedAt], t.[CreatedAt]) ASC,
          t.[Id] ASC;
      `)

    return NextResponse.json({ success: true, data: result.recordset })
  } catch (error: unknown) {
    console.error("[Warehouse Factory Transfer] 查询待移交设备失败:", error)
    return NextResponse.json(
      { success: false, message: "查询待移交设备失败，请稍后重试" },
      { status: 500 }
    )
  }
}
