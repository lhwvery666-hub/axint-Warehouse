import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/warehouse-shipping-batches
// 获取所有待仓库发货的批次工单
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

    // 查询需要仓库安排发货的批次工单（使用 EXISTS 子查询）：
    // 只要批次中【任意一台设备】的状态属于以下之一，该批次就出现在待发货列表：
    //   - Warehouse_Shipping : 维修完成，待仓库发回客户现场
    //   - Pending_Shipment   : 待发货（通用）
    //   - Pending_Factory    : 维修工程师已提交返厂申请，仓库需安排寄送原厂（RMA）
    const result = await pool
      .request()
      .query(`
        SELECT 
          t1.${DB_FIELDS.BATCH_ID} as batchId,
          MAX(t1.ProjectName) as projectName,
          MAX(t1.ClientName) as clientName,
          MAX(COALESCE(t1.ClientName, t1.ProjectName)) as customerName,
          MAX(t1.ProjectLocation) as projectLocation,
          MAX(t1.Category) as category,
          MAX(u.RealName) as reportedBy,
          MAX(u.Username) as reportedByUsername,
          MAX(CAST(t1.${DB_FIELDS.REPORT_BY_USER_ID} AS NVARCHAR(50))) as reportedByUserId,
          STRING_AGG(CAST(COALESCE(t1.${DB_FIELDS.DEVICE_SN}, '') AS NVARCHAR(MAX)), '|') as deviceSerials,
          STRING_AGG(CAST(COALESCE(t1.${DB_FIELDS.MODEL_NAME}, di.ModelName, '') AS NVARCHAR(MAX)), '|') as deviceModels,
          STRING_AGG(CAST(COALESCE(t1.${DB_FIELDS.STATUS}, '') AS NVARCHAR(MAX)), '|') as statuses,
          SUM(COALESCE(t1.Quantity, 1)) as deviceCount,
          MIN(t1.${DB_FIELDS.CREATED_AT}) as createdAt,
          MAX(t1.${DB_FIELDS.STATUS}) as status
        FROM Repair_Tickets t1
        LEFT JOIN Users u ON u.UserID = t1.${DB_FIELDS.REPORT_BY_USER_ID}
        LEFT JOIN Device_Inventory di ON di.SerialNumber = t1.${DB_FIELDS.DEVICE_SN}
        WHERE 
          t1.${DB_FIELDS.BATCH_ID} IS NOT NULL 
          AND t1.${DB_FIELDS.BATCH_ID} != ''
          AND EXISTS (
            SELECT 1 FROM Repair_Tickets t2
            WHERE t2.${DB_FIELDS.BATCH_ID} = t1.${DB_FIELDS.BATCH_ID}
              AND (
                t2.${DB_FIELDS.STATUS} = '${TicketStatus.WAREHOUSE_SHIPPING}'
                OR t2.${DB_FIELDS.STATUS} = '${TicketStatus.PENDING_SHIPMENT}'
                OR t2.${DB_FIELDS.STATUS} = '${TicketStatus.PENDING_FACTORY}'
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
    console.error("查询待发货批次失败:", errorMessage)
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage
      },
      { status: 500 }
    )
  }
}
