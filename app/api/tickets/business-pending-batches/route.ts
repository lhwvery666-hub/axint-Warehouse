import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus } from "@/lib/enums"

// GET /api/tickets/business-pending-batches
// 获取所有待商务审核的批次工单
export async function GET() {
  try {
    const pool = await getDbConnection()

    // 查询所有状态为 Business_Review 或 Admin_Review 的批次工单
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
          AND (
            ${DB_FIELDS.STATUS} = '${TicketStatus.BUSINESS_REVIEW}' 
            OR ${DB_FIELDS.STATUS} = '${TicketStatus.ADMIN_REVIEW}'
          )
        GROUP BY ${DB_FIELDS.BATCH_ID}
        ORDER BY MIN(${DB_FIELDS.CREATED_AT}) ASC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset
    })

  } catch (error: any) {
    console.error("查询待审核批次失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || "查询失败" 
      },
      { status: 500 }
    )
  }
}
