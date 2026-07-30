import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/business-pending-batches
// 获取所有待商务审核的批次工单
export async function GET() {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.BUSINESS])
  if (isErrorResponse(authResult)) return authResult

  try {
    const pool = await getDbConnection()

    // 查询所有状态为 Business_Review 或 Admin_Review 的批次工单
    const result = await pool
      .request()
      .query(`
        SELECT 
          t.${DB_FIELDS.BATCH_ID} as batchId,
          MAX(t.ProjectName) as projectName,
          MAX(t.ProjectLocation) as projectLocation,
          MAX(t.${DB_FIELDS.CLIENT_NAME}) as clientName,
          MAX(COALESCE(t.${DB_FIELDS.CLIENT_NAME}, t.ProjectName)) as customerName,
          MAX(t.Category) as category,
          MAX(u.RealName) as reportedBy,
          MAX(u.Username) as reportedByUsername,
          STRING_AGG(CAST(COALESCE(t.${DB_FIELDS.DEVICE_SN}, '') AS NVARCHAR(MAX)), '|') as deviceSerials,
          STRING_AGG(CAST(COALESCE(t.${DB_FIELDS.MODEL_NAME}, di.ModelName, '') AS NVARCHAR(MAX)), '|') as deviceModels,
          STRING_AGG(CAST(COALESCE(t.${DB_FIELDS.STATUS}, '') AS NVARCHAR(MAX)), '|') as statuses,
          SUM(COALESCE(t.Quantity, 1)) as deviceCount,
          MIN(t.${DB_FIELDS.CREATED_AT}) as createdAt,
          MAX(t.${DB_FIELDS.STATUS}) as status
        FROM Repair_Tickets t
        LEFT JOIN Users u ON u.UserID = t.${DB_FIELDS.REPORT_BY_USER_ID}
        LEFT JOIN Device_Inventory di ON di.SerialNumber = t.${DB_FIELDS.DEVICE_SN}
        WHERE 
          t.${DB_FIELDS.BATCH_ID} IS NOT NULL
          AND t.${DB_FIELDS.BATCH_ID} != ''
          AND (
            t.${DB_FIELDS.STATUS} = '${TicketStatus.BUSINESS_REVIEW}'
            OR t.${DB_FIELDS.STATUS} = '${TicketStatus.ADMIN_REVIEW}'
          )
        GROUP BY t.${DB_FIELDS.BATCH_ID}
        ORDER BY MIN(t.${DB_FIELDS.CREATED_AT}) ASC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset
    })

  } catch (error: unknown) {
    console.error("查询待审核批次失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        message: "查询失败"
      },
      { status: 500 }
    )
  }
}
