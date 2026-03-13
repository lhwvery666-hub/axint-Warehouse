import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/device/check?sn={sn}
// 根据序列号检查设备是否存在于 Device_Inventory，并返回基础信息
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sn = searchParams.get("sn")

    if (!sn) {
      return NextResponse.json(
        { success: false, message: "sn 参数必填" },
        { status: 400 }
      )
    }

    // 使用 Prisma ORM 查询设备
    const device = await prisma.device_Inventory.findUnique({
      where: {
        serialNumber: sn
      },
      select: {
        serialNumber: true,
        modelName: true,
        deviceName: true,
        materialCode: true,
        status: true,
        location: true, // 修正：使用 location 字段
        specification: true,
        category: true,
        subCategory: true
      }
    })

    if (!device) {
      return NextResponse.json({ exists: false })
    }

    const status = device.status || ''
    const isInStock = status === '在库' || status === 'In Stock' || status.toLowerCase() === 'instock'

    return NextResponse.json({
      exists: true,
      data: {
        serialNumber: device.serialNumber,
        modelName: device.modelName || '',
        deviceName: device.deviceName || device.modelName || '', // 物料名称（优先使用 deviceName）
        location: device.location || '', // 修正：返回 location
        materialCode: device.materialCode || '', // 物料代码
        status: status, // 状态
        warehouse: device.location || '', // 兼容旧字段名（前端可能用 warehouse）
        fullSpec: device.specification || device.modelName || '', // 规格型号
        category: device.category || '',
        subCategory: device.subCategory || ''
      },
      warning: isInStock ? '该设备状态为"在库"，通常不需要报修，请确认是否继续？' : null, // 在库警告
    })
  } catch (error: any) {
    console.error("检查设备序列号失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "检查设备序列号失败",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

