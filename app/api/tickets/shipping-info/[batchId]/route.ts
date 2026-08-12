import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole } from "@/lib/enums"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/shipping-info/[batchId]
// 获取批次的发货信息
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const resolvedParams = await Promise.resolve(context.params)

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 动态检查 ShippingType 字段是否存在
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const columnNames = columnsResult.recordset.map((row: unknown) => {
      const r = row as { COLUMN_NAME: string }
      return r.COLUMN_NAME
    })
    
    const hasShippingType = columnNames.some(c => c.toLowerCase() === 'shippingtype')

    // 构建动态查询
    let selectFields = `
      ReturnDate,
      ReturnTrackingNum,
      ReturnQuantity,
      WarehouseShippedAt,
      WarehouseShippedBy
    `
    if (hasShippingType) {
      selectFields = `ShippingType, ${selectFields}`
    }

    // 优先查询有发货信息的设备（有 ReturnTrackingNum 或 ReturnDate）
    // 如果没有，再查询批次中的第一个设备（用于验证批次存在）
    const resultWithShipping = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1
          ${selectFields}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
          AND (
            (ReturnTrackingNum IS NOT NULL AND ReturnTrackingNum != '')
            OR ReturnDate IS NOT NULL
          )
        ORDER BY 
          CASE WHEN ReturnTrackingNum IS NOT NULL AND ReturnTrackingNum != '' THEN 0 ELSE 1 END,
          CASE WHEN ReturnDate IS NOT NULL THEN 0 ELSE 1 END
      `)

    let data: {
      ShippingType?: string
      ReturnDate?: Date
      ReturnTrackingNum?: string
      ReturnQuantity?: number
      WarehouseShippedAt?: Date
      WarehouseShippedBy?: string
    } | null = null

    if (resultWithShipping.recordset.length > 0) {
      // 找到了有发货信息的设备
      data = resultWithShipping.recordset[0] as {
        ShippingType?: string
        ReturnDate?: Date
        ReturnTrackingNum?: string
        ReturnQuantity?: number
        WarehouseShippedAt?: Date
        WarehouseShippedBy?: string
      }
    } else {
      // 验证批次是否存在
      const batchCheck = await pool
        .request()
        .input("batchId", batchId)
        .query(`
          SELECT TOP 1 ${DB_FIELDS.ID}
          FROM Repair_Tickets
          WHERE ${DB_FIELDS.BATCH_ID} = @batchId
        `)

      if (batchCheck.recordset.length === 0) {
        return NextResponse.json(
          { success: false, message: "批次不存在" },
          { status: 404 }
        )
      }

      // 批次存在但没有发货信息，返回空数据
      return NextResponse.json({
        success: true,
        data: {
          shippingType: null,
          returnDate: null,
          returnTrackingNum: null,
          returnQuantity: null,
          shippedAt: null,
          shippedBy: null
        }
      })
    }

    if (!data) {
      return NextResponse.json(
        { success: false, message: "未找到发货信息" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        shippingType: data.ShippingType || null,
        returnDate: data.ReturnDate || null,
        returnTrackingNum: data.ReturnTrackingNum || null,
        returnQuantity: data.ReturnQuantity || null,
        shippedAt: data.WarehouseShippedAt || null,
        shippedBy: data.WarehouseShippedBy || null
      }
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "获取发货信息失败"
    console.error("获取发货信息失败:", error)
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    )
  }
}

// PUT /api/tickets/shipping-info/[batchId]
// 只保存批次发货信息；状态流转由 warehouse-shipping-batch 专用接口负责。
const shippingInfoSchema = z.object({
  shippingType: z.enum(["return", "stock"]),
  returnDate: z.string().datetime().nullable().optional(),
  returnTrackingNum: z.string().trim().max(200).optional(),
  returnQuantity: z.coerce.number().int().min(1).max(100000).optional(),
}).strict()

export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.WAREHOUSE, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const batchIdResult = z.string().trim().min(1).max(100).safeParse((await context.params).batchId)
    const bodyResult = shippingInfoSchema.safeParse(await request.json().catch(() => null))
    if (!batchIdResult.success || !bodyResult.success) {
      return NextResponse.json(
        { success: false, message: "请求参数无效" },
        { status: 400 }
      )
    }
    const batchId = batchIdResult.data
    const { shippingType, returnDate, returnQuantity } = bodyResult.data
    const returnTrackingNum = bodyResult.data.returnTrackingNum?.replace(/\s+/g, "") || null

    // 验证：如果是发回客户，必须填写发货信息
    if (shippingType === "return" && (!returnDate || !returnTrackingNum)) {
      return NextResponse.json(
        { success: false, message: "发回客户时，发货日期和快递单号为必填项" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 动态检查 ShippingType 字段是否存在
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const columnNames = columnsResult.recordset.map((row: unknown) => {
      const r = row as { COLUMN_NAME: string }
      return r.COLUMN_NAME
    })
    
    const hasShippingType = columnNames.some(c => c.toLowerCase() === 'shippingtype')

    // 验证批次存在
    const batchResult = await pool
      .request()
      .input("batchId", sql.NVarChar(100), batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}, ${DB_FIELDS.STATUS}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (batchResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次不存在" },
        { status: 404 }
      )
    }
    if (batchResult.recordset.some((row: Record<string, unknown>) =>
      !["Warehouse_Shipping", "Pending_Shipment", "Completed"].includes(String(row[DB_FIELDS.STATUS])))
    ) {
      return NextResponse.json(
        { success: false, message: "当前批次状态不允许保存发货信息，请刷新页面" },
        { status: 409 }
      )
    }

    // 构建动态更新SQL
    const updateFields = [
      'ReturnDate = @returnDate',
      'ReturnTrackingNum = @returnTrackingNum',
      'ReturnQuantity = @returnQuantity',
      `${DB_FIELDS.UPDATED_AT} = @updatedAt`
    ]
    
    if (hasShippingType) {
      updateFields.unshift('ShippingType = @shippingType')
    }

    // 保存字段，不触碰 Status、WarehouseShippedAt 或 WarehouseShippedBy。
    const updateRequest = pool
      .request()
      .input("batchId", sql.NVarChar(100), batchId)
      .input("returnDate", sql.DateTime2, returnDate ? new Date(returnDate) : null)
      .input("returnTrackingNum", sql.NVarChar(200), returnTrackingNum)
      .input("returnQuantity", sql.Int, returnQuantity ?? null)
      .input("updatedAt", sql.DateTime2, new Date())
    
    if (hasShippingType) {
      updateRequest.input("shippingType", shippingType || null)
    }

    await updateRequest.query(`
      UPDATE Repair_Tickets
      SET ${updateFields.join(', ')}
      WHERE ${DB_FIELDS.BATCH_ID} = @batchId
    `)

    return NextResponse.json({
      success: true,
      message: "发货信息已保存，工单状态未改变"
    })
  } catch (error: unknown) {
    console.error("更新发货信息失败:", error)
    return NextResponse.json(
      { success: false, message: "保存发货信息失败，请稍后重试" },
      { status: 500 }
    )
  }
}
