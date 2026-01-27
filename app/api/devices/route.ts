import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";

// GET /api/devices
// 从 SQL Server 的 Device_Inventory 表获取设备列表
export async function GET() {
  try {
    const pool = await getDbConnection();

    const result = await pool.request().query(`
      SELECT 
        SerialNumber as id,
        SerialNumber,
        ModelName,
        ProjectLocation,
        NULL as warrantyEndDate,
        'active' as status
      FROM Device_Inventory
      ORDER BY SerialNumber
    `);

    const devices = result.recordset.map((row: any) => ({
      id: row.id || row.SerialNumber,
      serialNumber: row.SerialNumber,
      modelName: row.ModelName || '',
      projectLocation: row.ProjectLocation || '',
      warrantyEndDate: row.warrantyEndDate || '',
      status: row.status || 'active',
    }));

    return NextResponse.json({ success: true, data: devices });
  } catch (error: any) {
    console.error("获取设备列表失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "获取设备列表失败",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    );
  }
}
