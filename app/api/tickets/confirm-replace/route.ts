import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import * as sql from "mssql"

// POST /api/tickets/confirm-replace
// 仓库管理员确认换货并发货：
// - 更新工单状态为 Completed，ResolutionType = 'Replaced'
// - 写入 NewDeviceSN 和回寄物流
// - 自动入库 / 更新 Device_Inventory 中的新设备信息
export async function POST(request: Request) {
  let transaction: sql.Transaction | null = null

  try {
    const body = await request.json()
    const { ticketId, newDeviceSn, returnCourier } = body ?? {}

    if (!ticketId || !newDeviceSn) {
      return NextResponse.json(
        { success: false, message: "ticketId 和 newDeviceSn 为必填项" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 使用事务保证工单更新和设备档案变更的原子性
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const txRequest = new sql.Request(transaction)

    // 1. 读取工单，获取原设备 SN
    const ticketResult = await txRequest
      .input("ticketId", ticketId)
      .query(
        `
        SELECT TOP 1 Id, DeviceSN
        FROM Repair_Tickets
        WHERE Id = @ticketId
      `
      )

    if (ticketResult.recordset.length === 0) {
      await transaction.rollback()
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      )
    }

    const ticket = ticketResult.recordset[0] as {
      Id: number
      DeviceSN: string
    }

    // 2. 根据原设备 SN 查询设备档案，获取项目地点（用于新设备入库）
    const originalDeviceResult = await txRequest
      .input("originalSn", ticket.DeviceSN)
      .query(
        `
        SELECT TOP 1 SerialNumber, ModelName, ProjectLocation
        FROM Device_Inventory
        WHERE SerialNumber = @originalSn
      `
      )

    const originalDevice = originalDeviceResult.recordset[0] as
      | {
          SerialNumber: string
          ModelName: string
          ProjectLocation: string | null
        }
      | undefined

    const projectLocation = originalDevice?.ProjectLocation || null

    // 3. 更新工单为已换货完成
    const now = new Date().toISOString()

    await txRequest
      .input("ticketId", ticketId)
      .input("status", "Completed")
      .input("resolutionType", "Replaced")
      .input("newDeviceSn", newDeviceSn)
      .input("courierNumber", returnCourier || null) // 这里将回寄物流号写入 CourierNumber
      .input("updatedAt", now)
      .query(
        `
        UPDATE Repair_Tickets
        SET Status = @status,
            ResolutionType = @resolutionType,
            NewDeviceSN = @newDeviceSn,
            CourierNumber = @courierNumber,
            UpdatedAt = @updatedAt
        WHERE Id = @ticketId
      `
      )

    // 4. 检查新设备是否已经存在于 Device_Inventory
    const newDeviceResult = await txRequest
      .input("newSn", newDeviceSn)
      .query(
        `
        SELECT TOP 1 SerialNumber
        FROM Device_Inventory
        WHERE SerialNumber = @newSn
      `
      )

    if (newDeviceResult.recordset.length === 0) {
      // 不存在：插入新设备记录，继承原设备的项目地点和型号（如有）
      await txRequest
        .input("newSn", newDeviceSn)
        .input("modelName", originalDevice?.ModelName || "未知型号")
        .input("projectLocation", projectLocation)
        .query(
          `
          INSERT INTO Device_Inventory (SerialNumber, ModelName, ProjectLocation)
          VALUES (@newSn, @modelName, @projectLocation)
        `
        )
    } else {
      // 已存在：仅更新项目地点为当前项目地点
      await txRequest
        .input("newSn", newDeviceSn)
        .input("projectLocation", projectLocation)
        .query(
          `
          UPDATE Device_Inventory
          SET ProjectLocation = @projectLocation
          WHERE SerialNumber = @newSn
        `
        )
    }

    await transaction.commit()

    return NextResponse.json(
      {
        success: true,
        message: "换货已确认并完成，设备档案已更新",
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("确认换货失败:", error)

    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error("回滚事务时发生错误:", rollbackError)
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: "确认换货时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

