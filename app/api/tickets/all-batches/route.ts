import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/all-batches
// 获取所有批次工单（不限制状态）
// @permission ADMIN, WAREHOUSE, TECHNICIAN, BUSINESS
export async function GET() {
  try {
    // ==================== 权限验证（第一行，遵守 cursorrules） ====================
    const authResult = await checkUserRole([
      UserRole.ADMIN,
      UserRole.WAREHOUSE,
      UserRole.TECHNICIAN,
      UserRole.BUSINESS
    ])
    if (isErrorResponse(authResult)) {
      return authResult
    }

    // ==================== 数据库查询 ====================
    const pool = await getDbConnection()

    // 查询所有批次工单
    const result = await pool
      .request()
      .query(`
        SELECT 
          t.${DB_FIELDS.BATCH_ID} as batchId,
          MAX(t.ProjectName) as projectName,
          MAX(t.ClientName) as clientName,
          MAX(COALESCE(t.ClientName, t.ProjectName)) as customerName,
          MAX(t.ProjectLocation) as projectLocation,
          MAX(t.Category) as category,
          MAX(u.RealName) as reportedBy,
          MAX(u.Username) as reportedByUsername,
          MAX(CAST(t.${DB_FIELDS.REPORT_BY_USER_ID} AS NVARCHAR(50))) as reportedByUserId,
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
        GROUP BY t.${DB_FIELDS.BATCH_ID}
        ORDER BY MIN(t.${DB_FIELDS.CREATED_AT}) DESC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "查询失败"
    console.error("查询所有批次失败:", errorMessage)
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage
      },
      { status: 500 }
    )
  }
}
