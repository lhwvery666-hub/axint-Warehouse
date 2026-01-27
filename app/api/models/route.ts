import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"

// GET /api/models
// 从 SQL Server 的 Product_Catalog 表获取设备型号列表（支持分类，用于三级联动）
export async function GET() {
  try {
    const pool = await getDbConnection()

    const result = await pool.request().query(`
      SELECT *
      FROM Product_Catalog
      ORDER BY DisplayOrder
    `)

    const models = result.recordset.map((row: any) => {
      const id =
        row.Id ?? row.ID ?? row.id ?? row.Code ?? row.ModelCode ?? row.DisplayName

      const code = row.ModelCode ?? row.Code ?? null
      const name = row.DisplayName ?? row.ModelName ?? row.Name ?? ""

      // 兼容多种命名的一级分类/二级分类/详细规格字段
      const category =
        row.Category ?? row.DeviceCategory ?? row.PrimaryCategory ?? null
      const subCategory =
        row.SubCategory ?? row.DeviceSubCategory ?? row.SecondaryCategory ?? null
      const fullSpec =
        row.FullSpec ?? row.Specification ?? row.Spec ?? row.ModelName ?? null

      return {
        id,
        code,
        name,
        category,
        subCategory,
        fullSpec,
      }
    })

    return NextResponse.json({ success: true, data: models })
  } catch (error: any) {
    console.error("获取设备型号列表失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取设备型号列表失败",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

