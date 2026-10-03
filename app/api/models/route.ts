import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { UserRole } from "@/lib/enums"

// GET /api/models
// 从 SQL Server 的 Product_Catalog 表获取设备型号列表（支持分类，用于三级联动）
export async function GET() {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    // 使用 Prisma ORM 查询 Product_Catalog
    const products = await prisma.product_Catalog.findMany({
      where: {
        isActive: true, // 只返回激活的产品
      },
      orderBy: [
        { category: 'asc' },
        { subCategory: 'asc' },
        { modelName: 'asc' },
      ],
      select: {
        productId: true, modelCode: true, modelName: true, category: true,
        subCategory: true, specification: true, description: true, manufacturer: true,
      },
    })

    // 映射到前端需要的字段格式
    const models = products.map((product) => ({
      id: product.productId,
      name: product.modelName,
      category: product.category,
      subCategory: product.subCategory,
      ...(authResult.normalizedRole !== UserRole.REPORTER ? {
        code: product.modelCode,
        fullSpec: product.specification || product.description,
        manufacturer: product.manufacturer,
      } : {}),
    }))

    return NextResponse.json({ success: true, data: models })
  } catch (error: unknown) {
    console.error("获取设备型号列表失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取设备型号列表失败",
      },
      { status: 500 }
    )
  }
}

