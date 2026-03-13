import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole, normalizeUserRole } from "@/lib/enums"
import { cookies } from "next/headers"
import { unlink } from "fs/promises"
import { join } from "path"

/**
 * POST /api/tickets/signed-photo/[batchId]
 * 记录维修人员查看签字照片（自动锁定，防止现场人员修改）
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    const pool = await getDbConnection()
    
    // 查询用户角色
    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userData = userResult.recordset[0]
    const normalizedRole = normalizeUserRole(userData.Role)
    
    // 只有维修人员可以标记查看
    if (normalizedRole !== UserRole.TECHNICIAN) {
      return NextResponse.json(
        { 
          success: false, 
          message: "只有维修人员可以查看签字照片" 
        },
        { status: 403 }
      )
    }

    // 更新查看记录
    await pool
      .request()
      .input("batchId", batchId)
      .input("viewedBy", userIdCookie)
      .input("viewedAt", new Date())
      .query(`
        UPDATE Repair_Tickets
        SET 
          ${DB_FIELDS.SIGNED_PHOTO_VIEWED_BY} = @viewedBy,
          ${DB_FIELDS.SIGNED_PHOTO_VIEWED_AT} = @viewedAt
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
        AND ${DB_FIELDS.SIGNED_REPORT_PHOTO} IS NOT NULL
      `)

    console.log(`✅ 维修人员 ${userData.RealName} 查看了签字照片，照片已锁定`)

    return NextResponse.json({
      success: true,
      message: "查看记录已保存",
      data: {
        viewedBy: userIdCookie,
        viewedAt: new Date().toISOString(),
      }
    })
  } catch (error: any) {
    console.error("记录查看失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "记录查看失败" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/tickets/signed-photo/[batchId]
 * 删除签字照片（只有现场人员且照片未被查看时可以删除）
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    const pool = await getDbConnection()
    
    // 查询用户角色
    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userData = userResult.recordset[0]
    const normalizedRole = normalizeUserRole(userData.Role)
    
    // 只有现场人员可以删除
    if (normalizedRole !== UserRole.REPORTER) {
      return NextResponse.json(
        { 
          success: false, 
          message: "只有现场人员可以删除签字照片" 
        },
        { status: 403 }
      )
    }

    // 查询照片信息和查看状态
    const ticketResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1
          ${DB_FIELDS.SIGNED_REPORT_PHOTO},
          ${DB_FIELDS.SIGNED_PHOTO_VIEWED_BY}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (ticketResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      )
    }

    const ticket = ticketResult.recordset[0]
    const photoPath = ticket[DB_FIELDS.SIGNED_REPORT_PHOTO]
    const viewedBy = ticket[DB_FIELDS.SIGNED_PHOTO_VIEWED_BY]

    if (!photoPath) {
      return NextResponse.json(
        { success: false, message: "没有签字照片" },
        { status: 404 }
      )
    }

    // 检查是否已被查看
    if (viewedBy) {
      return NextResponse.json(
        { 
          success: false, 
          message: "签字照片已被维修人员查看，无法删除。如需修改请申请。" 
        },
        { status: 403 }
      )
    }

    // 删除服务器上的文件
    try {
      const filePath = join(process.cwd(), 'public', photoPath)
      await unlink(filePath)
      console.log(`✅ 删除照片文件: ${filePath}`)
    } catch (fileError) {
      console.warn(`⚠️ 删除照片文件失败（可能已不存在）:`, fileError)
    }

    // 清空数据库中的照片字段，同时将状态回退到 PENDING_REPORTER_CONFIRM，
    // 使现场人员可以重新上传签字照片。
    await pool
      .request()
      .input("batchId", batchId)
      .input("pendingStatus", "Pending_Reporter_Confirm")
      .query(`
        UPDATE Repair_Tickets
        SET 
          ${DB_FIELDS.SIGNED_REPORT_PHOTO}     = NULL,
          ${DB_FIELDS.SIGNED_PHOTO_VIEWED_BY}  = NULL,
          ${DB_FIELDS.SIGNED_PHOTO_VIEWED_AT}  = NULL,
          ${DB_FIELDS.STATUS}                  = @pendingStatus
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    console.log(`✅ 现场人员 ${userData.RealName} 删除了签字照片，状态已回退至 Pending_Reporter_Confirm`)

    return NextResponse.json({
      success: true,
      message: "签字照片已删除"
    })
  } catch (error: any) {
    console.error("删除签字照片失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "删除失败" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/tickets/signed-photo/[batchId]
 * 申请修改签字照片（照片已被查看后，现场人员需要申请修改）
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId
    const body = await request.json()
    const { reason } = body

    if (!reason || reason.trim() === "") {
      return NextResponse.json(
        { success: false, message: "请填写修改原因" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()
    
    // 查询用户信息
    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userData = userResult.recordset[0]
    const normalizedRole = normalizeUserRole(userData.Role)
    
    // 只有现场人员可以申请
    if (normalizedRole !== UserRole.REPORTER) {
      return NextResponse.json(
        { 
          success: false, 
          message: "只有现场人员可以申请修改" 
        },
        { status: 403 }
      )
    }

    // 创建修改申请记录
    const modifyRequest = {
      requestBy: userIdCookie,
      requestByName: userData.RealName,
      reason: reason.trim(),
      requestAt: new Date().toISOString(),
      status: "pending", // pending, approved, rejected
    }

    // 保存申请记录
    await pool
      .request()
      .input("batchId", batchId)
      .input("modifyRequest", JSON.stringify(modifyRequest))
      .query(`
        UPDATE Repair_Tickets
        SET ${DB_FIELDS.SIGNED_PHOTO_MODIFY_REQUEST} = @modifyRequest
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    console.log(`✅ 现场人员 ${userData.RealName} 申请修改签字照片`)

    return NextResponse.json({
      success: true,
      message: "修改申请已提交，等待管理员审批"
    })
  } catch (error: any) {
    console.error("提交修改申请失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "提交失败" },
      { status: 500 }
    )
  }
}
