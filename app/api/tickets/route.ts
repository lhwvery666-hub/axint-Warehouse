import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { cookies } from "next/headers"
import { TicketStatus, normalizeTicketStatus } from "@/lib/enums"
import { prisma } from "@/lib/prisma"

// ==================== 类型定义 ====================

/** 数据库 Repair_Tickets 字段映射后的行类型（mssql recordset → 标准字段名） */
interface TicketDbRow {
  Id: number | string | null
  DeviceSN: string | null
  ModelName: string | null
  ProjectLocation: string | null
  FaultDescription: string | null
  ReportByUserID: number | string | null
  CourierCompany: string | null
  CourierNumber: string | null
  Status: string | null
  ReportTime: Date | string | null
  ProductSN: string | null
  WorkOrderNumber: string | null
  BatchId: string | null
  ContactInfo: string | null
  SenderAddress: string | null
  Problem: string | null
  CustomerName: string | null
  SignedReportPhoto: string | null
  Quantity: number | null
  // ── 关键节点时间字段（用于前端时间范围筛选按状态维度动态切换） ──
  WarehouseShippedAt: Date | string | null
  BusinessReviewedAt: Date | string | null
  TechnicianCompletedAt: Date | string | null
  // ── 通用更新时间（completed 池在 WarehouseShippedAt 缺失时的降级兜底） ──
  UpdatedAt: Date | string | null
}

interface DeviceInfoRow {
  SerialNumber: string
  DeviceName: string | null
  ModelName: string | null
}

interface UserInfoRow {
  UserID: number | string
  RealName: string | null
  Username: string | null
}

interface DelayHistoryRow {
  TicketID: string | null
  DelayTo: Date | null
  DelayReason: string | null
  CreatedAt: Date | null
}

interface MappedTicket {
  id: string
  workOrderNumber: string
  batchId: string | null
  deviceSerialNumber: string
  productSN: string
  deviceName: string
  deviceModel: string
  projectLocation: string
  problem: string
  status: TicketStatus
  reportedBy: string
  reportedByUserId: string
  reportedAt: string
  courierCompany: string
  trackingNumber: string
  expectedCompletionDate: string | null
  delayReason: string | null
  contactInfo: string
  senderAddress: string
  customerName: string
  signedReportPhoto: string | null
  messageCount: number
  quantity: number
  // ── 关键节点时间字段（ISO 字符串，可为空） ──
  warehouseShippedAt: string | null
  businessReviewedAt: string | null
  technicianCompletedAt: string | null
  updatedAt: string | null
}

// GET /api/tickets
// 获取所有维修工单
export async function GET() {
  try {
    // ✅ Rule 5 — 路由保护：必须登录才能访问全量工单列表
    const cookieStore = await cookies()
    const authUserId = cookieStore.get("userId")?.value ?? null
    if (!authUserId) {
      return NextResponse.json({ success: false, message: "未登录，请先登录" }, { status: 401 })
    }

    const pool = await getDbConnection()

    let mappedRecords: TicketDbRow[] = []
    let actualColumns: string[] = []

    try {
      // 先查询表结构，获取实际的列名
      const columnInfo = await pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Repair_Tickets'
        ORDER BY ORDINAL_POSITION
      `)

      actualColumns = columnInfo.recordset.map((row: { COLUMN_NAME: string }) => row.COLUMN_NAME)
      console.log('Repair_Tickets 表的实际列名:', actualColumns)

      // 构建查询，使用实际的列名（显式列出，避免 SELECT *）
      const selectColumns = actualColumns.map((col: string) => `[${col}]`).join(', ')
      const orderByCol = actualColumns.find(
        (col: string) => col.toLowerCase().includes('time') || col.toLowerCase().includes('report')
      ) ?? actualColumns[actualColumns.length - 1]

      const rawResult = await pool.request().query(`
        SELECT ${selectColumns}
        FROM Repair_Tickets
        ORDER BY [${orderByCol}] DESC
      `)

      // 将原始列名映射到标准字段名
      mappedRecords = rawResult.recordset.map((row: Record<string, unknown>, idx: number): TicketDbRow => {
        const mapped: TicketDbRow = {
          Id: null, DeviceSN: null, ModelName: null, ProjectLocation: null,
          FaultDescription: null, ReportByUserID: null, CourierCompany: null,
          CourierNumber: null, Status: null, ReportTime: null, ProductSN: null,
          WorkOrderNumber: null, BatchId: null, ContactInfo: null, SenderAddress: null,
          Problem: null, CustomerName: null, SignedReportPhoto: null, Quantity: null,
          WarehouseShippedAt: null, BusinessReviewedAt: null, TechnicianCompletedAt: null,
          UpdatedAt: null,
        }

        if (idx < 3) {
          console.log(`🔍 原始 row[${idx}]:`, JSON.stringify(row, null, 2).substring(0, 500))
        }

        actualColumns.forEach((actualCol: string) => {
          const lowerCol = actualCol.toLowerCase()
          // ⚠️ 只匹配 'id' 和 'repair_ticket_id'，严禁包含 'ticketid'。
          // 表中 TicketId(NVarChar, 可空) 和 Id(INT 主键) 是两个不同字段，
          // 若把 ticketid 也映射到 mapped.Id，TicketId 为 null 时会将主键覆盖为 null。
          if (lowerCol === 'id' || lowerCol === 'repair_ticket_id') {
            mapped.Id = (row[actualCol] as number | string | null) ?? null
            if (idx < 3) console.log(`🔍 映射 Id: actualCol="${actualCol}", mapped.Id=${mapped.Id}`)
          } else if (lowerCol === 'devicesn' || lowerCol === 'device_sn') {
            mapped.DeviceSN = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'modelname' || lowerCol === 'model_name') {
            mapped.ModelName = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'projectlocation' || lowerCol === 'project_location') {
            mapped.ProjectLocation = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'faultdescription' || lowerCol === 'fault_description') {
            mapped.FaultDescription = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'reportbyuserid' || lowerCol === 'report_by_user_id') {
            mapped.ReportByUserID = (row[actualCol] as number | string | null) ?? null
          } else if (lowerCol === 'couriercompany' || lowerCol === 'courier_company') {
            mapped.CourierCompany = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'couriernumber' || lowerCol === 'courier_number') {
            mapped.CourierNumber = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'status') {
            mapped.Status = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'reporttime' || lowerCol === 'report_time') {
            mapped.ReportTime = (row[actualCol] as Date | string | null) ?? null
          } else if (lowerCol === 'productsn' || lowerCol === 'product_sn') {
            mapped.ProductSN = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'workordernumber' || lowerCol === 'work_order_number') {
            mapped.WorkOrderNumber = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'batchid' || lowerCol === 'batch_id') {
            mapped.BatchId = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'contactinfo' || lowerCol === 'contact_info') {
            mapped.ContactInfo = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'senderaddress' || lowerCol === 'sender_address') {
            mapped.SenderAddress = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'problem') {
            mapped.Problem = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'customername' || lowerCol === 'customer_name') {
            mapped.CustomerName = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'signedreportphoto' || lowerCol === 'signed_report_photo') {
            mapped.SignedReportPhoto = (row[actualCol] as string | null) ?? null
          } else if (lowerCol === 'quantity') {
            mapped.Quantity = row[actualCol] != null ? Number(row[actualCol]) : null
          } else if (lowerCol === 'warehouseshippedat') {
            mapped.WarehouseShippedAt = (row[actualCol] as Date | string | null) ?? null
          } else if (lowerCol === 'businessreviewedat') {
            mapped.BusinessReviewedAt = (row[actualCol] as Date | string | null) ?? null
          } else if (lowerCol === 'techniciancompletedat') {
            mapped.TechnicianCompletedAt = (row[actualCol] as Date | string | null) ?? null
          } else if (lowerCol === 'updatedat') {
            mapped.UpdatedAt = (row[actualCol] as Date | string | null) ?? null
          }
        })

        if (idx < 3) {
          console.log(`🔍 映射后 mapped[${idx}].Id = ${mapped.Id}, DeviceSN = ${mapped.DeviceSN}`)
        }

        return mapped
      })
    } catch (queryError: unknown) {
      console.error("SQL 查询失败:", queryError)
      return NextResponse.json(
        {
          success: false,
          message: "查询维修工单失败",
          error: queryError instanceof Error ? queryError.message : "数据库查询错误",
        },
        { status: 500 }
      )
    }

    // ── 批量查询设备信息 ──────────────────────────────────────────
    const deviceSNs = mappedRecords
      .map((row) => row.DeviceSN)
      .filter((sn): sn is string => typeof sn === 'string' && sn.trim() !== '')
      .filter((sn, index, self) => self.indexOf(sn) === index) // 去重

    const deviceInfoMap = new Map<string, { deviceName: string; modelName: string }>()

    if (deviceSNs.length > 0) {
      try {
        const batchSize = 100
        for (let i = 0; i < deviceSNs.length; i += batchSize) {
          const batch = deviceSNs.slice(i, i + batchSize)
          const placeholders = batch.map((_, idx) => `@sn${idx}`).join(',')
          const request = pool.request()
          batch.forEach((sn, idx) => request.input(`sn${idx}`, sn))

          const deviceResult = await request.query(`
            SELECT SerialNumber, DeviceName, ModelName
            FROM Device_Inventory
            WHERE SerialNumber IN (${placeholders})
          `)

          deviceResult.recordset.forEach((device: DeviceInfoRow) => {
            deviceInfoMap.set(device.SerialNumber, {
              deviceName: device.DeviceName ?? "",
              modelName: device.ModelName ?? "",
            })
          })
        }
      } catch (deviceError: unknown) {
        console.error("批量查询设备信息失败:", deviceError instanceof Error ? deviceError.message : deviceError)
        // 降级为逐条查询
        for (const sn of deviceSNs) {
          try {
            const r = await pool.request().input("serialNumber", sn).query(`
              SELECT TOP 1 SerialNumber, DeviceName, ModelName
              FROM Device_Inventory WHERE SerialNumber = @serialNumber
            `)
            if (r.recordset.length > 0) {
              const d = r.recordset[0] as DeviceInfoRow
              deviceInfoMap.set(d.SerialNumber, { deviceName: d.DeviceName ?? "", modelName: d.ModelName ?? "" })
            }
          } catch (singleErr: unknown) {
            console.error(`查询设备 ${sn} 失败:`, singleErr instanceof Error ? singleErr.message : singleErr)
          }
        }
      }
    }

    // ── 批量查询报告人信息 ──────────────────────────────────────────
    const userIds = mappedRecords
      .map((row) => row.ReportByUserID)
      .filter((id): id is number | string => id != null && id !== '')
      .filter((id, index, self) => self.indexOf(id) === index) // 去重

    const userInfoMap = new Map<string | number, string>()

    if (userIds.length > 0) {
      try {
        const batchSize = 100
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize)
          const placeholders = batch.map((_, idx) => `@userId${idx}`).join(',')
          const request = pool.request()
          batch.forEach((userId, idx) => request.input(`userId${idx}`, userId))

          const userResult = await request.query(`
            SELECT UserID, RealName, Username FROM Users WHERE UserID IN (${placeholders})
          `)

          userResult.recordset.forEach((user: UserInfoRow) => {
            userInfoMap.set(user.UserID, user.RealName ?? user.Username ?? String(user.UserID))
          })
        }
      } catch (userError: unknown) {
        console.error("批量查询用户信息失败:", userError instanceof Error ? userError.message : userError)
        for (const userId of userIds) {
          try {
            const r = await pool.request().input("userId", userId).query(`
              SELECT TOP 1 UserID, RealName, Username FROM Users WHERE UserID = @userId
            `)
            if (r.recordset.length > 0) {
              const u = r.recordset[0] as UserInfoRow
              userInfoMap.set(u.UserID, u.RealName ?? u.Username ?? String(u.UserID))
            }
          } catch (singleErr: unknown) {
            console.error(`查询用户 ${userId} 失败:`, singleErr instanceof Error ? singleErr.message : singleErr)
          }
        }
      }
    }

    // ── 批量查询延期信息 ──────────────────────────────────────────
    const delayInfoMap: Record<string, { delayTo: string | null; delayReason: string | null; createdAtMs: number }> = {}
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
        .filter((row: DelayHistoryRow) => row.TicketID != null)
        .forEach((row: DelayHistoryRow) => {
          const id = row.TicketID?.toString()
          if (!id) return
          const createdAtMs = row.CreatedAt ? new Date(row.CreatedAt).getTime() : 0
          const existing = delayInfoMap[id]
          if (!existing || createdAtMs > existing.createdAtMs) {
            delayInfoMap[id] = {
              delayTo: row.DelayTo ? new Date(row.DelayTo).toISOString() : null,
              delayReason: row.DelayReason ?? null,
              createdAtMs,
            }
          }
        })
    } catch (delayError: unknown) {
      console.error("批量查询延期信息失败:", delayError instanceof Error ? delayError.message : delayError)
    }

    // ── 组装最终 Ticket 列表 ──────────────────────────────────────
    const tickets: MappedTicket[] = mappedRecords.map((row, rowIndex): MappedTicket => {
      const deviceInfo = deviceInfoMap.get(row.DeviceSN ?? "") ?? { deviceName: "", modelName: "" }
      const reporterName = row.ReportByUserID != null
        ? (userInfoMap.get(row.ReportByUserID) ?? String(row.ReportByUserID))
        : ""

      console.log(`🔍 映射工单 #${rowIndex}: row.Id = ${row.Id}, type = ${typeof row.Id}, DeviceSN = ${row.DeviceSN}`)

      let idStr: string
      if (row.Id != null && row.Id !== '') {
        idStr = String(row.Id)
        console.log(`✅ 使用数据库ID: ${idStr}`)
      } else {
        // 后备方案（理论上不应触发，Id 字段不应为空）
        // 注意：不能用 DeviceSN 作为 ID，因为多条记录可能有相同 SN（如"待验证"），会导致重复 key
        idStr = `ticket-${rowIndex}-${Date.now()}`
        console.warn(`⚠️ 数据库ID为空，使用后备方案: ${idStr}`)
      }

      const delayInfo = delayInfoMap[idStr] ?? null

      // ✅ 使用 normalizeTicketStatus 统一映射，消除 Magic String if-else 链（Rule 4）
      const mappedStatus: TicketStatus = normalizeTicketStatus(row.Status ?? "") ?? TicketStatus.CREATED

      return {
        id: idStr,
        workOrderNumber: row.WorkOrderNumber ?? "",
        batchId: row.BatchId ?? null,
        deviceSerialNumber: row.DeviceSN ?? "",
        productSN: row.ProductSN ?? row.DeviceSN ?? "",
        deviceName: deviceInfo.deviceName || (row.ModelName ?? ""),
        deviceModel: deviceInfo.modelName || (row.ModelName ?? ""),
        projectLocation: row.ProjectLocation ?? "",
        problem: row.FaultDescription ?? row.Problem ?? "",
        status: mappedStatus,
        reportedBy: reporterName,
        reportedByUserId: row.ReportByUserID != null ? String(row.ReportByUserID) : "",
        reportedAt: row.ReportTime ? new Date(row.ReportTime as string).toISOString() : new Date().toISOString(),
        courierCompany: row.CourierCompany ?? "",
        trackingNumber: row.CourierNumber ?? "",
        expectedCompletionDate: delayInfo?.delayTo ?? null,
        delayReason: delayInfo?.delayReason ?? null,
        contactInfo: row.ContactInfo ?? "",
        senderAddress: row.SenderAddress ?? "",
        customerName: row.CustomerName ?? "",
        signedReportPhoto: row.SignedReportPhoto ?? null,
        quantity: row.Quantity ?? 1,
        warehouseShippedAt: row.WarehouseShippedAt ? new Date(row.WarehouseShippedAt as string).toISOString() : null,
        businessReviewedAt: row.BusinessReviewedAt ? new Date(row.BusinessReviewedAt as string).toISOString() : null,
        technicianCompletedAt: row.TechnicianCompletedAt ? new Date(row.TechnicianCompletedAt as string).toISOString() : null,
        updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt as string).toISOString() : null,
        messageCount: 0, // 将在下方填充
      }
    })

    // ── 批量查询消息数量 ──────────────────────────────────────────
    const messageCountMap: Record<string, number> = {}
    const batchIds = [...new Set(tickets.map((t) => t.batchId).filter((id): id is string => id !== null))]

    if (batchIds.length > 0) {
      try {
        // ✅ 使用顶部导入的共享 prisma 单例，禁止在函数内 new PrismaClient()（Rule 3）
        const messageCounts = await prisma.ticketMessage.groupBy({
          by: ['ticketId'],
          where: { ticketId: { in: batchIds } },
          _count: { id: true },
        })

        messageCounts.forEach((item: { ticketId: string; _count: { id: number } }) => {
          messageCountMap[item.ticketId] = item._count.id
        })
      } catch (msgError: unknown) {
        console.error("批量查询消息数量失败:", msgError instanceof Error ? msgError.message : msgError)
      }
    }

    tickets.forEach((ticket) => {
      ticket.messageCount = ticket.batchId ? (messageCountMap[ticket.batchId] ?? 0) : 0
    })

    return NextResponse.json({ success: true, data: tickets })
  } catch (error: unknown) {
    console.error("获取维修工单失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取维修工单时发生错误",
        error: error instanceof Error ? error.message : "未知错误",
        stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
