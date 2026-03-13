import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole, TicketStatus } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// GET /api/tickets/shipping-info/[batchId]
// 获取批次的发货信息
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const resolvedParams =
      "then" in (context as {params: Promise<{batchId: string}>}).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

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
      data = resultWithShipping.recordset[0] as typeof data
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
// 更新批次的发货信息
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const resolvedParams =
      "then" in (context as {params: Promise<{batchId: string}>}).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId
    const body = await request.json()
    let { shippingType, returnDate, returnTrackingNum, returnQuantity } = body
    
    // 清理快递单号中的空格（防呆处理）
    if (returnTrackingNum && typeof returnTrackingNum === 'string') {
      returnTrackingNum = returnTrackingNum.replace(/\s+/g, '')
    }

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    // 验证用户登录和权限（自动处理缺失的 userRole cookie）
    const authResult = await checkUserRole([UserRole.WAREHOUSE, UserRole.ADMIN])
    if (isErrorResponse(authResult)) {
      return NextResponse.json(authResult, { status: 403 })
    }

    const { userId: userIdCookie } = authResult
    console.log(`[发货信息保存] ✅ 权限验证通过，userId: ${userIdCookie}`)

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

    // 构建动态更新SQL
    let updateFields = [
      'ReturnDate = @returnDate',
      'ReturnTrackingNum = @returnTrackingNum',
      'ReturnQuantity = @returnQuantity',
      'WarehouseShippedAt = GETUTCDATE()',
      'WarehouseShippedBy = @shippedBy',
      `${DB_FIELDS.STATUS} = @newStatus`,
      `${DB_FIELDS.UPDATED_AT} = @updatedAt`
    ]
    
    if (hasShippingType) {
      updateFields.unshift('ShippingType = @shippingType')
    }

    // 更新发货信息并完成工单
    const updateRequest = pool
      .request()
      .input("batchId", batchId)
      .input("returnDate", returnDate ? new Date(returnDate) : null)
      .input("returnTrackingNum", returnTrackingNum || null)
      .input("returnQuantity", returnQuantity || null)
      .input("shippedBy", userIdCookie)
      .input("newStatus", TicketStatus.COMPLETED)
      .input("updatedAt", new Date())
    
    if (hasShippingType) {
      updateRequest.input("shippingType", shippingType || null)
    }

    await updateRequest.query(`
      UPDATE Repair_Tickets
      SET ${updateFields.join(', ')}
      WHERE ${DB_FIELDS.BATCH_ID} = @batchId
    `)

    console.log(`✅ 发货信息已更新并完成工单: ${batchId}`)

    return NextResponse.json({
      success: true,
      message: shippingType === "return" 
        ? "发货完成！设备已发回客户，工单已完成" 
        : "入库完成！设备已入库，工单已完成"
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "更新发货信息失败"
    console.error("更新发货信息失败:", error)
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    )
  }
}
