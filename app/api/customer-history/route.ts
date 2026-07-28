import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET: 获取当前用户的历史客户信息
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    // 获取用户的历史客户信息，按最后使用时间排序
    const customerHistory = await prisma.customer_History.findMany({
      where: {
        userId: parseInt(userId),
      },
      orderBy: [
        { lastUsedAt: 'desc' },
        { useCount: 'desc' },
      ],
      take: 20, // 最多返回 20 条记录
    })

    return NextResponse.json({
      success: true,
      data: customerHistory,
    })
  } catch (error: any) {
    console.error('获取历史客户信息失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '获取历史客户信息失败' },
      { status: 500 }
    )
  }
}

// POST: 保存或更新客户信息（在创建工单时自动调用）
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { customerName, contactPerson, contactPhone, address } = body

    if (!customerName) {
      return NextResponse.json(
        { success: false, error: '客户名称不能为空' },
        { status: 400 }
      )
    }

    const numericUserId = parseInt(userId)
    const existing = await prisma.customer_History.findFirst({
      where: { userId: numericUserId, customerName },
      select: { id: true },
    })

    const customerHistory = existing
      ? await prisma.customer_History.update({
          where: { id: existing.id },
          data: {
        contactPerson,
        contactPhone,
        address,
        lastUsedAt: new Date(),
        useCount: {
          increment: 1,
        },
          },
        })
      : await prisma.customer_History.create({
          data: {
            userId: numericUserId,
            customerName,
            contactPerson,
            contactPhone,
            address,
            useCount: 1,
          },
        })

    return NextResponse.json({
      success: true,
      data: customerHistory,
    })
  } catch (error: any) {
    console.error('保存客户信息失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '保存客户信息失败' },
      { status: 500 }
    )
  }
}
