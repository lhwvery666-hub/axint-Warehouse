import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

// GET /api/batch/[id]
// 获取批次详情及其所有工单
export async function GET(request: Request, { params }: Props) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      );
    }

    // 使用 Prisma 查询批次信息及关联的工单
    const batch = await prisma.batch.findUnique({
      where: {
        id: id,
      },
      include: {
        tickets: {
          orderBy: {
            createdAt: "desc",
          },
        },
        project: true,
        customer: true,
      },
    });

    if (!batch) {
      return NextResponse.json(
        { success: false, message: "批次不存在" },
        { status: 404 }
      );
    }

    // 格式化返回数据
    const formattedBatch = {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      description: batch.description,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      createdBy: batch.createdBy,
      project: batch.project
        ? {
            id: batch.project.id,
            name: batch.project.name,
            location: batch.project.location,
          }
        : null,
      customer: batch.customer
        ? {
            id: batch.customer.id,
            name: batch.customer.name,
            address: batch.customer.address,
            phone: batch.customer.phone,
          }
        : null,
      tickets: batch.tickets.map((ticket) => ({
        id: ticket.id,
        ticketId: ticket.ticketId,
        deviceSn: ticket.deviceSn,
        modelName: ticket.modelName,
        deviceName: ticket.deviceName,
        problem: ticket.problem,
        status: ticket.status,
        priority: ticket.priority,
        location: ticket.location,
        reportedBy: ticket.reportedBy,
        expressCompany: ticket.expressCompany,
        trackingNumber: ticket.trackingNumber,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt?.toISOString() || null,
        projectLocation: ticket.projectLocation,
        materialCode: ticket.materialCode,
        senderAddress: ticket.senderAddress,
        contactInfo: ticket.contactInfo,
        courierInfo: ticket.courierInfo,
        trackingNumberIn: ticket.trackingNumberIn,
      })),
      ticketCount: batch.tickets.length,
    };

    return NextResponse.json({
      success: true,
      data: formattedBatch,
    });
  } catch (error: any) {
    console.error("获取批次详情失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "获取批次详情时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    );
  }
}
