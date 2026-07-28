import { NextResponse } from "next/server"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { getDbConnection } from "@/lib/db-config"
import { UserRole } from "@/lib/enums"

const MESSAGE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TECHNICIAN,
  UserRole.WAREHOUSE,
  UserRole.REPORTER,
  UserRole.BUSINESS,
]

interface MessageRequestBody {
  ticketId?: unknown
  content?: unknown
}

/**
 * GET /api/messages?ticketId=xxx
 * 获取指定工单的聊天记录。
 */
export async function GET(request: Request) {
  const authResult = await checkUserRole(MESSAGE_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const ticketId = searchParams.get("ticketId")?.trim()

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "缺少工单号参数" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()
    const result = await pool
      .request()
      .input("ticketId", ticketId)
      .query(`
        SELECT
          Id AS id,
          TicketId AS ticketId,
          SenderName AS senderName,
          SenderRole AS senderRole,
          Content AS content,
          CreatedAt AS createdAt
        FROM TicketMessage
        WHERE TicketId = @ticketId
        ORDER BY CreatedAt ASC, Id ASC
      `)

    return NextResponse.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    })
  } catch (error: unknown) {
    console.error("获取聊天记录失败:", error)
    return NextResponse.json(
      { success: false, message: "获取聊天记录失败" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/messages
 * 发送新消息。发送者姓名与角色始终取自数据库中的登录用户，忽略客户端伪造值。
 */
export async function POST(request: Request) {
  const authResult = await checkUserRole(MESSAGE_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const body = (await request.json()) as MessageRequestBody
    const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : ""
    const content = typeof body.content === "string" ? body.content.trim() : ""

    if (!ticketId || !content) {
      return NextResponse.json(
        { success: false, message: "工单号和消息内容不能为空" },
        { status: 400 }
      )
    }

    const senderName = authResult.realName || authResult.username
    const pool = await getDbConnection()
    const result = await pool
      .request()
      .input("ticketId", ticketId)
      .input("senderName", senderName)
      .input("senderRole", authResult.userRole)
      .input("content", content)
      .query(`
        INSERT INTO TicketMessage (
          TicketId,
          SenderName,
          SenderRole,
          Content,
          CreatedAt
        )
        OUTPUT
          INSERTED.Id AS id,
          INSERTED.TicketId AS ticketId,
          INSERTED.SenderName AS senderName,
          INSERTED.SenderRole AS senderRole,
          INSERTED.Content AS content,
          INSERTED.CreatedAt AS createdAt
        VALUES (
          @ticketId,
          @senderName,
          @senderRole,
          @content,
          GETUTCDATE()
        )
      `)

    return NextResponse.json({
      success: true,
      message: "消息发送成功",
      data: result.recordset[0],
    })
  } catch (error: unknown) {
    console.error("发送聊天消息失败:", error)
    return NextResponse.json(
      { success: false, message: "发送消息失败" },
      { status: 500 }
    )
  }
}
