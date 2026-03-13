import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/messages?ticketId=xxx
 * 获取指定工单的所有聊天消息
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get("ticketId");

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "缺少工单号参数" },
        { status: 400 }
      );
    }

    console.log(`📨 获取工单 ${ticketId} 的聊天记录`);

    // 查询该工单的所有消息，按时间升序排列
    const messages = await prisma.ticketMessage.findMany({
      where: {
        ticketId: ticketId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: messages,
      count: messages.length,
    });
  } catch (error: any) {
    console.error("❌ 获取聊天记录失败:", error);
    return NextResponse.json(
      { success: false, message: error.message || "获取聊天记录失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/messages
 * 发送新消息到指定工单
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticketId, senderName, senderRole, content } = body;

    // 参数验证
    if (!ticketId || !senderName || !senderRole || !content) {
      return NextResponse.json(
        {
          success: false,
          message: "缺少必填参数：ticketId, senderName, senderRole, content",
        },
        { status: 400 }
      );
    }

    if (content.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "消息内容不能为空" },
        { status: 400 }
      );
    }

    console.log(`📤 发送消息到工单 ${ticketId}: ${senderName} (${senderRole})`);

    // 创建新消息
    const newMessage = await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderName,
        senderRole,
        content: content.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "消息发送成功",
      data: newMessage,
    });
  } catch (error: any) {
    console.error("❌ 发送消息失败:", error);
    return NextResponse.json(
      { success: false, message: error.message || "发送消息失败" },
      { status: 500 }
    );
  }
}
