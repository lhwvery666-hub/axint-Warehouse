import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"

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

    const pool = await getDbConnection()

    // 先检查 FullSpec 字段是否存在
    let hasFullSpecColumn = false
    try {
      const columnCheck = await pool.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Device_Inventory' AND COLUMN_NAME = 'FullSpec'
      `)
      hasFullSpecColumn = columnCheck.recordset.length > 0
    } catch (checkError) {
      console.error("检查 FullSpec 字段失败:", checkError)
    }

    // 动态构建查询字段
    const selectFields = hasFullSpecColumn
      ? "SerialNumber, ModelName, DeviceName, ProjectLocation, MaterialCode, Status, Warehouse, FullSpec"
      : "SerialNumber, ModelName, DeviceName, ProjectLocation, MaterialCode, Status, Warehouse"

    const result = await pool
      .request()
      .input("serialNumber", sn)
      .query(
        `
        SELECT TOP 1 ${selectFields}
        FROM Device_Inventory
        WHERE SerialNumber = @serialNumber
      `
      )

    if (result.recordset.length === 0) {
      return NextResponse.json({ exists: false })
    }

    const row = result.recordset[0] as any
    const status = row.Status || ''
    const isInStock = status === '在库' || status === 'In Stock' || status.toLowerCase() === 'instock'

    return NextResponse.json({
      exists: true,
      data: {
        serialNumber: row.SerialNumber,
        modelName: row.ModelName || '',
        deviceName: row.DeviceName || row.ModelName || '', // 物料名称（优先使用 DeviceName）
        location: row.ProjectLocation || '',
        materialCode: row.MaterialCode || '', // 物料代码
        status: status, // 状态
        warehouse: row.Warehouse || '', // 仓库
        fullSpec: row.FullSpec || row.ModelName || '', // 规格型号（优先使用 FullSpec，否则使用 ModelName）
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
  }
}

