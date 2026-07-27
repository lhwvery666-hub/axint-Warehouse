import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/warehouse-pending-batches
// 获取所有待仓库确认的批次工单
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

    // 查询需要仓库【确认设备信息】的批次工单（使用 EXISTS 子查询）：
    // 只要批次中【任意一台设备】的状态属于以下之一，该批次就出现在仓库待确认列表：
    //   - Created            : 新建批次，待仓库首次确认设备信息 + 填写出厂日期
    //   - Warehouse_Confirming: 设备 SN/型号已变更，需仓库重新确认
    //
    // ⚠️ 注意：Pending_Factory（待送厂/返厂中）不在此列——
    //    该状态表示维修工程师已提交返厂申请，设备进入原厂维修流程，
    //    不需要仓库再走"确认"流程，应由发货/物流环节处理。
    //
    // COUNT(*) 统计该批次下的全部设备数量，方便仓库核对全量清单
    const result = await pool
      .request()
      .query(`
        SELECT 
          t1.${DB_FIELDS.BATCH_ID} as batchId,
          MAX(t1.ProjectName) as projectName,
          MAX(t1.ProjectLocation) as projectLocation,
          MAX(t1.Category) as category,
          SUM(COALESCE(Quantity, 1)) as deviceCount,
          MIN(t1.${DB_FIELDS.CREATED_AT}) as createdAt,
          MAX(t1.${DB_FIELDS.STATUS}) as status
        FROM Repair_Tickets t1
        WHERE 
          t1.${DB_FIELDS.BATCH_ID} IS NOT NULL 
          AND t1.${DB_FIELDS.BATCH_ID} != ''
          AND EXISTS (
            SELECT 1 FROM Repair_Tickets t2
            WHERE t2.${DB_FIELDS.BATCH_ID} = t1.${DB_FIELDS.BATCH_ID}
              AND (
                t2.${DB_FIELDS.STATUS} = '${TicketStatus.CREATED}'
                OR t2.${DB_FIELDS.STATUS} = '${TicketStatus.WAREHOUSE_CONFIRMING}'
              )
          )
        GROUP BY t1.${DB_FIELDS.BATCH_ID}
        ORDER BY MIN(t1.${DB_FIELDS.CREATED_AT}) ASC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "查询失败"
    console.error("查询待确认批次失败:", errorMessage)
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage
      },
      { status: 500 }
    )
  }
}
