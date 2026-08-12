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
    //   - Pending_Factory    : 返厂维修，待仓库优先寄往维修厂家
    //   - Warehouse_Shipping : 维修完成，待仓库发回客户现场
    //   - Pending_Shipment   : 待发货（通用）
    // “待移交”用于返厂后的进度跟进；“待发货”同时承担返厂寄出的优先操作入口。
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
          SUM(
            CASE
              WHEN t1.${DB_FIELDS.STATUS} = '${TicketStatus.PENDING_FACTORY}'
                   AND NULLIF(LTRIM(RTRIM(t1.${DB_FIELDS.SIGNED_REPORT_PHOTO})), '') IS NOT NULL
                THEN COALESCE(t1.Quantity, 1)
              ELSE 0
            END
          ) as pendingFactoryDeviceCount,
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
                (t2.${DB_FIELDS.STATUS} = '${TicketStatus.PENDING_FACTORY}'
                 AND NULLIF(LTRIM(RTRIM(t2.${DB_FIELDS.SIGNED_REPORT_PHOTO})), '') IS NOT NULL)
                OR t2.${DB_FIELDS.STATUS} = '${TicketStatus.WAREHOUSE_SHIPPING}'
                OR t2.${DB_FIELDS.STATUS} = '${TicketStatus.PENDING_SHIPMENT}'
              )
          )
        GROUP BY t1.${DB_FIELDS.BATCH_ID}
        ORDER BY
          CASE
            WHEN MAX(
              CASE
                WHEN t1.${DB_FIELDS.STATUS} = '${TicketStatus.PENDING_FACTORY}'
                     AND NULLIF(LTRIM(RTRIM(t1.${DB_FIELDS.SIGNED_REPORT_PHOTO})), '') IS NOT NULL THEN 1
                ELSE 0
              END
            ) = 1 THEN 0
            ELSE 1
          END,
          MIN(t1.${DB_FIELDS.CREATED_AT}) ASC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset
    })

  } catch (error: unknown) {
    console.error("查询待发货批次失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        message: "查询待发货批次失败，请稍后重试"
      },
      { status: 500 }
    )
  }
}
