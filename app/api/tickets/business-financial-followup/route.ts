import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/business-financial-followup
// 获取"已办/财务跟进"批次：已经过商务处理（授权发货及以后的节点），
// 但收款或开票尚未完成的批次工单。
//
// ⚠️ 免费维修批次（任务2里 IsChargeable=0 自动跳过商务审核的批次）不出现在此列表——
// 它们在跳过时已经被标记为 IsPaymentReceived=1，天然满足"已结清"，无需财务跟进。
// @permission ADMIN, BUSINESS
export async function GET() {
  try {
    // ==================== 权限验证（第一行，遵守 cursorrules） ====================
    const authResult = await checkUserRole([
      UserRole.ADMIN,
      UserRole.BUSINESS,
    ])
    if (isErrorResponse(authResult)) {
      return authResult
    }

    // ==================== 数据库查询 ====================
    const pool = await getDbConnection()

    // "已过商务"判定：批次内至少有一台设备的状态已到达"仓库发货"及之后的节点
    // （商务审核环节的收款/开票字段此时已经落库，只是尚未结清）。
    // 由于聚合条件（MAX/CASE）无法写在 WHERE 里，统一放到 HAVING 中判断。
    const result = await pool
      .request()
      .query(`
        SELECT 
          t.${DB_FIELDS.BATCH_ID} as batchId,
          MAX(t.ProjectName) as projectName,
          MAX(t.ProjectLocation) as projectLocation,
          MAX(t.${DB_FIELDS.CLIENT_NAME}) as clientName,
          MAX(COALESCE(t.${DB_FIELDS.CLIENT_NAME}, t.ProjectName)) as customerName,
          MAX(t.ContactInfo) as contactInfo,
          MAX(t.Category) as category,
          MAX(u.RealName) as reportedBy,
          MAX(u.Username) as reportedByUsername,
          STRING_AGG(CAST(COALESCE(t.${DB_FIELDS.DEVICE_SN}, '') AS NVARCHAR(MAX)), '|') as deviceSerials,
          STRING_AGG(CAST(COALESCE(t.${DB_FIELDS.MODEL_NAME}, di.ModelName, '') AS NVARCHAR(MAX)), '|') as deviceModels,
          STRING_AGG(CAST(COALESCE(t.${DB_FIELDS.STATUS}, '') AS NVARCHAR(MAX)), '|') as statuses,
          SUM(COALESCE(t.Quantity, 1)) as deviceCount,
          MIN(t.${DB_FIELDS.CREATED_AT}) as createdAt,
          MAX(t.${DB_FIELDS.STATUS}) as status,
          MAX(CAST(t.${DB_FIELDS.IS_PAYMENT_RECEIVED} AS INT)) as isPaymentReceived,
          MAX(CAST(t.${DB_FIELDS.IS_INVOICED} AS INT)) as isInvoiced,
          SUM(COALESCE(t.${DB_FIELDS.REPAIR_COST}, 0)) as totalCost,
          MAX(t.BusinessReviewedAt) as reviewedAt,
          MAX(t.BusinessReviewedBy) as reviewedBy
        FROM Repair_Tickets t
        LEFT JOIN Users u ON u.UserID = t.${DB_FIELDS.REPORT_BY_USER_ID}
        LEFT JOIN Device_Inventory di ON di.SerialNumber = t.${DB_FIELDS.DEVICE_SN}
        WHERE 
          t.${DB_FIELDS.BATCH_ID} IS NOT NULL
          AND t.${DB_FIELDS.BATCH_ID} != ''
        GROUP BY t.${DB_FIELDS.BATCH_ID}
        HAVING 
          MAX(CAST(t.${DB_FIELDS.IS_CHARGEABLE} AS INT)) = 1
          AND MAX(
            CASE WHEN t.${DB_FIELDS.STATUS} IN (
              '${TicketStatus.WAREHOUSE_SHIPPING}',
              '${TicketStatus.COMPLETED}',
              '${TicketStatus.SCRAPPED}',
              '${TicketStatus.RETURN_UNREPAIRED}',
              '${TicketStatus.REJECTED_NO_RETURN}'
            ) THEN 1 ELSE 0 END
          ) = 1
          AND (
            MAX(CAST(t.${DB_FIELDS.IS_PAYMENT_RECEIVED} AS INT)) = 0
            OR MAX(CAST(t.${DB_FIELDS.IS_INVOICED} AS INT)) = 0
          )
        ORDER BY MIN(t.${DB_FIELDS.CREATED_AT}) ASC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "查询失败"
    console.error("查询财务跟进批次失败:", errorMessage)
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    )
  }
}
