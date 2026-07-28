import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { UserRole } from "@/lib/enums"

// GET /api/statistics
// 获取数据库统计信息
export async function GET() {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  try {
    const pool = await getDbConnection()

    // 1. 物料名称统计（按 DeviceName 分组）
    const deviceNameStatsResult = await pool.request().query(`
      SELECT 
        DeviceName,
        COUNT(*) as Count
      FROM Device_Inventory
      WHERE DeviceName IS NOT NULL AND DeviceName != ''
      GROUP BY DeviceName
      ORDER BY COUNT(*) DESC
    `)
    
    console.log('[统计API] 物料名称统计结果:', deviceNameStatsResult.recordset.length, '条')
    if (deviceNameStatsResult.recordset.length > 0) {
      console.log('[统计API] 前5条物料名称:', deviceNameStatsResult.recordset.slice(0, 5).map((r: any) => r.DeviceName))
    }

    // 2. 规格型号统计（按 ModelName 分组）
    const modelNameStatsResult = await pool.request().query(`
      SELECT 
        ModelName,
        COUNT(*) as Count
      FROM Device_Inventory
      WHERE ModelName IS NOT NULL AND ModelName != ''
      GROUP BY ModelName
      ORDER BY COUNT(*) DESC
    `)
    
    console.log('[统计API] 规格型号统计结果:', modelNameStatsResult.recordset.length, '条')
    if (modelNameStatsResult.recordset.length > 0) {
      console.log('[统计API] 前5条规格型号:', modelNameStatsResult.recordset.slice(0, 5).map((r: any) => r.ModelName))
    }

    // 3. 维修工单统计（按状态分组）
    const repairStats = await pool.request().query(`
      SELECT 
        Status,
        COUNT(*) as Count
      FROM Repair_Tickets
      GROUP BY Status
      ORDER BY COUNT(*) DESC
    `)

    // 4. 总设备数
    const totalDevices = await pool.request().query(`
      SELECT COUNT(*) as Total FROM Device_Inventory
    `)

    // 5. 总工单数
    const totalRepairs = await pool.request().query(`
      SELECT COUNT(*) as Total FROM Repair_Tickets
    `)

    return NextResponse.json({
      success: true,
      data: {
        deviceNameStats: deviceNameStatsResult.recordset.map((row: any) => ({
          name: row.DeviceName,
          count: row.Count
        })),
        modelNameStats: modelNameStatsResult.recordset.map((row: any) => ({
          name: row.ModelName,
          count: row.Count
        })),
        repairStats: repairStats.recordset.map((row: any) => ({
          status: row.Status,
          count: row.Count
        })),
        totalDevices: totalDevices.recordset[0]?.Total || 0,
        totalRepairs: totalRepairs.recordset[0]?.Total || 0,
      }
    })
  } catch (error: unknown) {
    console.error("获取统计信息失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取统计信息时发生错误",
      },
      { status: 500 }
    )
  }
}
