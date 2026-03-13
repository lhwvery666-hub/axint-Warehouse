import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/warehouse-completed-batches
// 获取所有已完成的批次工单
// @permission ADMIN, WAREHOUSE
export async function GET() {
  try {
    // ==================== 权限验证（第一行，遵守 cursorrules） ====================
    const authResult = await checkUserRole([
      UserRole.ADMIN,
      UserRole.WAREHOUSE
    ])
    if (isErrorResponse(authResult)) {
      return authResult
    }

    // ==================== 数据库查询 ====================
    const pool = await getDbConnection()

    // 查询所有状态为 Completed 的批次工单
    const result = await pool
      .request()
      .query(`
        SELECT 
          ${DB_FIELDS.BATCH_ID} as batchId,
          MAX(ProjectName) as projectName,
          MAX(ProjectLocation) as projectLocation,
          MAX(Category) as category,
          COUNT(*) as deviceCount,
          MIN(${DB_FIELDS.CREATED_AT}) as createdAt,
          MAX(${DB_FIELDS.STATUS}) as status
        FROM Repair_Tickets
        WHERE 
          ${DB_FIELDS.BATCH_ID} IS NOT NULL 
          AND ${DB_FIELDS.BATCH_ID} != ''
          AND ${DB_FIELDS.STATUS} = '${TicketStatus.COMPLETED}'
        GROUP BY ${DB_FIELDS.BATCH_ID}
        ORDER BY MIN(${DB_FIELDS.CREATED_AT}) DESC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "查询失败"
    console.error("查询已完成批次失败:", errorMessage)
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage
      },
      { status: 500 }
    )
  }
}
