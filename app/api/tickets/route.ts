import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"

// GET /api/tickets
// 获取所有维修工单
export async function GET() {
  try {
    const pool = await getDbConnection()

    let result
    try {
      // 先查询表结构，获取实际的列名
      const columnInfo = await pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Repair_Tickets'
        ORDER BY ORDINAL_POSITION
      `)
      
      const actualColumns = columnInfo.recordset.map((row: any) => row.COLUMN_NAME)
      console.log('Repair_Tickets 表的实际列名:', actualColumns)
      
      // 找到主键列（通常是 ID 或 Id）
      const idColumn = actualColumns.find((col: string) => 
        col.toLowerCase() === 'id' || col.toLowerCase() === 'ticketid' || col.toLowerCase() === 'repair_ticket_id'
      ) || actualColumns[0] // 如果找不到，使用第一列
      
      // 构建查询，使用实际的列名
      const selectColumns = actualColumns.map((col: string) => `[${col}]`).join(', ')
      
      result = await pool.request().query(`
        SELECT ${selectColumns}
        FROM Repair_Tickets
        ORDER BY [${actualColumns.find((col: string) => col.toLowerCase().includes('time') || col.toLowerCase().includes('report')) || actualColumns[actualColumns.length - 1]}] DESC
      `)
      
      // 将结果映射到标准字段名（使用别名）
      result.recordset = result.recordset.map((row: any) => {
        const mapped: any = {}
        // 映射到标准字段名（不区分大小写查找）
        actualColumns.forEach((actualCol: string) => {
          const lowerCol = actualCol.toLowerCase()
          if (lowerCol === 'id' || lowerCol === 'ticketid' || lowerCol === 'repair_ticket_id') {
            mapped.Id = row[actualCol]
          } else if (lowerCol === 'devicesn' || lowerCol === 'device_sn') {
            mapped.DeviceSN = row[actualCol]
          } else if (lowerCol === 'modelname' || lowerCol === 'model_name') {
            mapped.ModelName = row[actualCol]
          } else if (lowerCol === 'projectlocation' || lowerCol === 'project_location') {
            mapped.ProjectLocation = row[actualCol]
          } else if (lowerCol === 'faultdescription' || lowerCol === 'fault_description') {
            mapped.FaultDescription = row[actualCol]
          } else if (lowerCol === 'reportbyuserid' || lowerCol === 'report_by_user_id') {
            mapped.ReportByUserID = row[actualCol]
          } else if (lowerCol === 'couriercompany' || lowerCol === 'courier_company') {
            mapped.CourierCompany = row[actualCol]
          } else if (lowerCol === 'couriernumber' || lowerCol === 'courier_number') {
            mapped.CourierNumber = row[actualCol]
          } else if (lowerCol === 'status') {
            mapped.Status = row[actualCol]
          } else if (lowerCol === 'reporttime' || lowerCol === 'report_time') {
            mapped.ReportTime = row[actualCol]
          } else if (lowerCol === 'productsn' || lowerCol === 'product_sn') {
            mapped.ProductSN = row[actualCol]
          }
        })
        return mapped
      })
    } catch (queryError: any) {
      console.error("SQL 查询失败:", queryError)
      return NextResponse.json(
        {
          success: false,
          message: "查询维修工单失败",
          error: queryError?.message || "数据库查询错误",
        },
        { status: 500 }
      )
    }

    // 获取所有唯一的设备序列号，批量查询设备信息
    const deviceSNs = result.recordset
      .map((row: any) => row.DeviceSN)
      .filter((sn: string) => sn && sn.trim() !== '')
      .filter((sn: string, index: number, self: string[]) => self.indexOf(sn) === index) // 去重
    
    const deviceInfoMap = new Map<string, { deviceName: string; modelName: string }>()
    
    if (deviceSNs.length > 0) {
      try {
        // 分批查询设备信息（每批最多100个，避免SQL语句过长）
        const batchSize = 100
        for (let i = 0; i < deviceSNs.length; i += batchSize) {
          const batch = deviceSNs.slice(i, i + batchSize)
          
          // 使用参数化查询，但 SQL Server 的 IN 子句需要动态构建
          // 为了安全，我们逐个查询或使用表值参数
          const placeholders = batch.map((_, idx) => `@sn${idx}`).join(',')
          const request = pool.request()
          
          batch.forEach((sn: string, idx: number) => {
            request.input(`sn${idx}`, sn)
          })
          
          const deviceResult = await request.query(`
            SELECT SerialNumber, DeviceName, ModelName
            FROM Device_Inventory
            WHERE SerialNumber IN (${placeholders})
          `)
          
          deviceResult.recordset.forEach((device: any) => {
            deviceInfoMap.set(device.SerialNumber, {
              deviceName: device.DeviceName || "",
              modelName: device.ModelName || ""
            })
          })
        }
      } catch (deviceError: any) {
        console.error("批量查询设备信息失败:", deviceError?.message)
        // 如果批量查询失败，尝试逐个查询
        for (const sn of deviceSNs) {
          try {
            const deviceResult = await pool
              .request()
              .input("serialNumber", sn)
              .query(`
                SELECT TOP 1 SerialNumber, DeviceName, ModelName
                FROM Device_Inventory
                WHERE SerialNumber = @serialNumber
              `)
            
            if (deviceResult.recordset.length > 0) {
              const device = deviceResult.recordset[0]
              deviceInfoMap.set(device.SerialNumber, {
                deviceName: device.DeviceName || "",
                modelName: device.ModelName || ""
              })
            }
          } catch (singleError: any) {
            console.error(`查询设备 ${sn} 失败:`, singleError?.message)
          }
        }
      }
    }

    // 批量查询所有报告人的信息
    const userIds = result.recordset
      .map((row: any) => row.ReportByUserID)
      .filter((id: any) => id != null && id !== undefined && id !== '')
      .filter((id: any, index: number, self: any[]) => self.indexOf(id) === index) // 去重
    
    const userInfoMap = new Map<string | number, string>()
    
    if (userIds.length > 0) {
      try {
        const batchSize = 100
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize)
          const placeholders = batch.map((_, idx) => `@userId${idx}`).join(',')
          const request = pool.request()
          
          batch.forEach((userId: any, idx: number) => {
            request.input(`userId${idx}`, userId)
          })
          
          const userResult = await request.query(`
            SELECT UserID, RealName, Username
            FROM Users
            WHERE UserID IN (${placeholders})
          `)
          
          userResult.recordset.forEach((user: any) => {
            // 优先使用 RealName，如果没有则使用 Username
            userInfoMap.set(user.UserID, user.RealName || user.Username || user.UserID?.toString() || "")
          })
        }
      } catch (userError: any) {
        console.error("批量查询用户信息失败:", userError?.message)
        // 如果批量查询失败，尝试逐个查询
        for (const userId of userIds) {
          try {
            const userResult = await pool
              .request()
              .input("userId", userId)
              .query(`
                SELECT TOP 1 UserID, RealName, Username
                FROM Users
                WHERE UserID = @userId
              `)
            
            if (userResult.recordset.length > 0) {
              const user = userResult.recordset[0]
              userInfoMap.set(user.UserID, user.RealName || user.Username || user.UserID?.toString() || "")
            }
          } catch (singleError: any) {
            console.error(`查询用户 ${userId} 失败:`, singleError?.message)
          }
        }
      }
    }

    // 批量查询延期信息（如果存在历史表）
    const delayInfoMap: Record<string, { delayTo: string | null; delayReason: string | null }> = {}
    try {
      const historyResult = await pool.request().query(`
        IF OBJECT_ID('dbo.Repair_Ticket_History', 'U') IS NOT NULL
        BEGIN
          SELECT TicketID, DelayTo, DelayReason, CreatedAt
          FROM [dbo].[Repair_Ticket_History]
          WHERE ActionType = 'Delay'
        END
        ELSE
        BEGIN
          SELECT CAST(NULL AS NVARCHAR(50)) AS TicketID,
                 CAST(NULL AS DATETIME) AS DelayTo,
                 CAST(NULL AS NVARCHAR(500)) AS DelayReason,
                 CAST(NULL AS DATETIME) AS CreatedAt
        END
      `)

      historyResult.recordset
        .filter((row: any) => row.TicketID != null)
        .forEach((row: any) => {
          const id = row.TicketID?.toString()
          if (!id) return
          const createdAtMs = row.CreatedAt ? new Date(row.CreatedAt).getTime() : 0
          const existing = delayInfoMap[id]
          if (!existing || createdAtMs > (existing as any).createdAtMs) {
            ;(delayInfoMap as any)[id] = {
              delayTo: row.DelayTo ? new Date(row.DelayTo).toISOString() : null,
              delayReason: row.DelayReason || null,
              createdAtMs,
            }
          }
        })
    } catch (delayError: any) {
      console.error("批量查询延期信息失败:", delayError?.message)
    }

    const tickets = result.recordset.map((row: any) => {
      const deviceInfo = deviceInfoMap.get(row.DeviceSN) || { deviceName: "", modelName: "" }
      const reporterName = userInfoMap.get(row.ReportByUserID) || row.ReportByUserID?.toString() || ""
      const idStr = row.Id?.toString() || ""
      const delayInfo = delayInfoMap[idStr]
      
      // 状态映射：确保返回正确的状态值
      const dbStatus = row.Status || "Created"
      const statusLower = (dbStatus || "").toLowerCase().trim()
      let mappedStatus = dbStatus // 默认使用原始值
      
      // 统一状态值
      if (statusLower === "created" || statusLower === "pending") {
        mappedStatus = "Created"
      } else if (statusLower === "in_repair" || statusLower === "processing") {
        mappedStatus = "In_Repair"
      } else if (statusLower === "admin_review") {
        mappedStatus = "Admin_Review"
      } else if (statusLower === "pending_shipment") {
        mappedStatus = "Pending_Shipment"
      } else if (statusLower === "completed") {
        mappedStatus = "Completed"
      } else if (statusLower === "unrepairable") {
        mappedStatus = "Unrepairable"
      } else if (statusLower === "pending_factory") {
        mappedStatus = "Pending_Factory"
      } else if (statusLower === "factory_finished") {
        mappedStatus = "Factory_Finished"
      } else if (statusLower === "return_unrepaired") {
        mappedStatus = "Return_Unrepaired"
      } else if (statusLower === "scrapped") {
        mappedStatus = "Scrapped"
      } else if (statusLower === "cancelled") {
        mappedStatus = "Cancelled"
      } else if (statusLower === "delayed") {
        mappedStatus = "Delayed"
      } else {
        // 如果状态未知，默认设为 Created
        mappedStatus = "Created"
      }
      
      return {
        id: idStr,
        deviceSerialNumber: row.DeviceSN || "",
        productSN: row.ProductSN || row.DeviceSN || "", // ProductSN 字段，如果不存在则使用 DeviceSN
        deviceName: deviceInfo.deviceName || row.ModelName || "", // 优先使用设备库存表的 DeviceName
        deviceModel: deviceInfo.modelName || "", // 规格型号
        projectLocation: row.ProjectLocation || "",
        problem: row.FaultDescription || "",
        status: mappedStatus, // 使用统一映射后的状态值
        reportedBy: reporterName, // 使用真实姓名用于显示
        reportedByUserId: row.ReportByUserID?.toString() || "", // 保留用户ID用于过滤
        reportedAt: row.ReportTime ? new Date(row.ReportTime).toISOString() : new Date().toISOString(),
        courierCompany: row.CourierCompany || "",
        trackingNumber: row.CourierNumber || "",
        expectedCompletionDate: delayInfo?.delayTo || null,
        delayReason: delayInfo?.delayReason || null,
      }
    })

    return NextResponse.json({
      success: true,
      data: tickets,
    })
  } catch (error: any) {
    console.error("获取维修工单失败:", error)
    const errorMessage = error?.message || "未知错误"
    const errorDetails = {
      success: false,
      message: "获取维修工单时发生错误",
      error: errorMessage,
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    }
    console.error("错误详情:", errorDetails)
    return NextResponse.json(errorDetails, { status: 500 })
  }
}
