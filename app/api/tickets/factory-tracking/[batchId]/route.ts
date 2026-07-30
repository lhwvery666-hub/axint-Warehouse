import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole } from "@/lib/enums"
import { cookies } from "next/headers"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// PUT /api/tickets/factory-tracking/[batchId]
// 保存返厂快递单号和寄出日期
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("session")
    if (!sessionCookie) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(context.params)
    const batchId = resolvedParams.batchId
    if (!batchId) {
      return NextResponse.json({ success: false, message: "批次ID不能为空" }, { status: 400 })
    }

    const body = await request.json()
    const { factoryTrackingNum, factoryShipDate } = body

    const pool = await getDbConnection()

    await pool
      .request()
      .input("batchId", batchId)
      .input("factoryTrackingNum", factoryTrackingNum?.trim() || null)
      .input("factoryShipDate", factoryShipDate ? new Date(factoryShipDate) : null)
      .query(`
        UPDATE Repair_Tickets
        SET FactoryTrackingNum = @factoryTrackingNum,
            FactoryShipDate    = @factoryShipDate
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    return NextResponse.json({ success: true, message: "返厂快递信息已保存" })
  } catch (error: unknown) {
    console.error("保存返厂快递信息失败:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "保存失败" },
      { status: 500 }
    )
  }
}
