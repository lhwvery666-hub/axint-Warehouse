import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole } from "@/lib/enums"
import { cookies } from "next/headers"

// GET /api/tickets/business-info/[batchId]
// 获取批次的商务审核信息
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    const result = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1
          IsChargeable,
          IsPaymentReceived,
          IsInvoiced,
          RepairCost,
          ClientName,
          BusinessReviewedAt,
          BusinessReviewedBy
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次不存在" },
        { status: 404 }
      )
    }

    const data = result.recordset[0]

    return NextResponse.json({
      success: true,
      data: {
        isChargeable: data.IsChargeable || false,
        isPaymentReceived: data.IsPaymentReceived || false,
        isInvoiced: data.IsInvoiced || false,
        totalCost: data.RepairCost || null,
        clientName: data.ClientName || null,
        reviewedAt: data.BusinessReviewedAt || null,
        reviewedBy: data.BusinessReviewedBy || null
      }
    })
  } catch (error: any) {
    console.error("获取商务信息失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "获取商务信息失败" },
      { status: 500 }
    )
  }
}

// PUT /api/tickets/business-info/[batchId]
// 更新批次的商务审核信息
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId
    const body = await request.json()
    const { isChargeable, isPaymentReceived, isInvoiced, totalCost, clientName } = body

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    // 验证用户登录和权限
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value
    const userRole = cookieStore.get("userRole")?.value

    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    if (userRole !== UserRole.BUSINESS && userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: "权限不足：只有商务人员可以修改商务信息" },
        { status: 403 }
      )
    }

    // 验证：如果收费，必须确认收款
    if (isChargeable && !isPaymentReceived) {
      return NextResponse.json(
        { success: false, message: "收费项目必须确认收款" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 验证批次存在
    const batchResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1 ${DB_FIELDS.ID}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (batchResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次不存在" },
        { status: 404 }
      )
    }

    // 更新商务信息
    await pool
      .request()
      .input("batchId", batchId)
      .input("isChargeable", isChargeable || false)
      .input("isPaymentReceived", isPaymentReceived || false)
      .input("isInvoiced", isInvoiced || false)
      .input("totalCost", totalCost || null)
      .input("clientName", clientName || null)
      .input("reviewedBy", userIdCookie)
      .query(`
        UPDATE Repair_Tickets
        SET IsChargeable = @isChargeable,
            IsPaymentReceived = @isPaymentReceived,
            IsInvoiced = @isInvoiced,
            RepairCost = @totalCost,
            ClientName = @clientName,
            BusinessReviewedAt = GETUTCDATE(),
            BusinessReviewedBy = @reviewedBy
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    console.log(`✅ 商务信息已更新: ${batchId}`)

    return NextResponse.json({
      success: true,
      message: "商务信息已更新"
    })
  } catch (error: any) {
    console.error("更新商务信息失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "更新商务信息失败" },
      { status: 500 }
    )
  }
}
