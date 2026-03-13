import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS } from "@/lib/enums"

// POST /api/tickets/batch-cancel/[batchId]
// 申请取消批次工单（取消批次中的所有设备）
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const body = await request.json()
    const { reason, userId } = body

    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次号不能为空" },
        { status: 400 }
      )
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, message: "取消原因不能为空" },
        { status: 400 }
      )
    }

    // 验证用户权限（只有现场人员可以申请取消）
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录，无法申请取消" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()

    // 验证用户角色
    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName, Username
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userRole = userResult.recordset[0].Role || ""
    const isReporter = userRole.toLowerCase().includes("reporter") || userRole === "现场人员"

    if (!isReporter) {
      return NextResponse.json(
        { success: false, message: "只有现场人员可以申请取消批次工单" },
        { status: 403 }
      )
    }

    // 查询批次中的所有设备
    const devicesResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}, ${DB_FIELDS.STATUS}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (devicesResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次工单不存在或已被删除" },
        { status: 404 }
      )
    }

    const devices = devicesResult.recordset

    // 检查批次状态（如果已完成或已取消，不允许取消）
    const hasCompletedOrCancelled = devices.some((d: any) => {
      const status = (d[DB_FIELDS.STATUS] || d.Status || "").toLowerCase()
      return status === "completed" || status === "cancelled"
    })

    if (hasCompletedOrCancelled) {
      return NextResponse.json(
        { success: false, message: "批次中部分设备已完成或已取消，无法申请取消整个批次" },
        { status: 400 }
      )
    }

    // 为批次中的所有设备添加取消申请
    const updatePromises = devices.map((device: any) => {
      const deviceId = device[DB_FIELDS.ID] || device.ID
      return pool
        .request()
        .input("ticketId", deviceId)
        .input("cancelRequestReason", reason.trim())
        .input("cancelRequestDate", new Date())
        .query(`
          UPDATE Repair_Tickets
          SET 
            CancelRequestStatus = 'Pending',
            CancelRequestReason = @cancelRequestReason,
            CancelRequestDate = @cancelRequestDate,
            ${DB_FIELDS.UPDATED_AT} = GETUTCDATE()
          WHERE ${DB_FIELDS.ID} = @ticketId
        `)
    })

    await Promise.all(updatePromises)

    return NextResponse.json({
      success: true,
      message: `批次工单取消申请已提交，共 ${devices.length} 台设备等待审批`,
      data: {
        batchId,
        deviceCount: devices.length
      }
    })

  } catch (error: any) {
    console.error("申请取消批次工单失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || "申请取消批次工单失败" 
      },
      { status: 500 }
    )
  }
}
