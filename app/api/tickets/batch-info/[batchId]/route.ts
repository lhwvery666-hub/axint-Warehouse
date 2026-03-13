import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole } from "@/lib/enums"
import { cookies } from "next/headers"

// PUT /api/tickets/batch-info/[batchId]
// 更新批次基本信息
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
    const { projectName, contactInfo, projectLocation, senderAddress } = body

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

    // 权限检查：只有现场人员和管理员可以修改批次基本信息
    if (userRole !== UserRole.REPORTER && userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: "权限不足：只有现场人员和管理员可以修改批次信息" },
        { status: 403 }
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

    // 构建更新语句
    const updateFields: string[] = []
    const updateRequest = pool.request()
    updateRequest.input("batchId", batchId)

    if (projectName !== undefined) {
      updateFields.push(`${DB_FIELDS.PROJECT_NAME} = @projectName`)
      updateRequest.input("projectName", projectName)
    }
    if (contactInfo !== undefined) {
      updateFields.push(`${DB_FIELDS.CONTACT_INFO} = @contactInfo`)
      updateRequest.input("contactInfo", contactInfo)
    }
    if (projectLocation !== undefined) {
      updateFields.push(`${DB_FIELDS.PROJECT_LOCATION} = @projectLocation`)
      updateRequest.input("projectLocation", projectLocation)
    }
    if (senderAddress !== undefined) {
      updateFields.push(`${DB_FIELDS.SENDER_ADDRESS} = @senderAddress`)
      updateRequest.input("senderAddress", senderAddress)
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { success: false, message: "没有需要更新的字段" },
        { status: 400 }
      )
    }

    // 更新批次中所有设备的信息
    await updateRequest.query(`
      UPDATE Repair_Tickets
      SET ${updateFields.join(", ")}
      WHERE ${DB_FIELDS.BATCH_ID} = @batchId
    `)

    console.log(`✅ 批次信息已更新: ${batchId}`)

    return NextResponse.json({
      success: true,
      message: "批次信息已更新"
    })
  } catch (error: any) {
    console.error("更新批次信息失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "更新批次信息失败" },
      { status: 500 }
    )
  }
}
