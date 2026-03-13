import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketActionType, TicketStatus } from "@/lib/enums"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { cookies } from "next/headers"

/**
 * PUT /api/tickets/reporter-confirm/[batchId]
 * 现场人员确认维修报告，上传签字凭证。
 *
 * 支持两种调用形式：
 *  A. 直接发送 File（signedPhoto 字段）→ 路由内部处理文件写入
 *  B. 先通过 /api/upload 上传，再传已持久化的路径字符串（signedPhotoPath 字段）→ 路由直接使用
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  try {
    // ── 认证 ─────────────────────────────────────────────────────────────────
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null

    // 兼容 Next.js 新旧两种 params 形态
    const resolvedParams = await Promise.resolve(context.params)
    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json({ success: false, message: "批次ID不能为空" }, { status: 400 })
    }

    // ── 读取 FormData ─────────────────────────────────────────────────────────
    const formData     = await request.formData()
    const devicesJson  = formData.get("devices")  as string | null
    // Form A: 文件对象
    const signedPhotoFileRaw = formData.get("signedPhoto")
    // Form B: 已上传文件的持久化路径字符串
    const signedPhotoPathRaw = formData.get("signedPhotoPath") as string | null

    // devices 可选（仅上传签字照片时不传）
    let devices: Record<string, unknown>[] = []
    if (devicesJson) {
      try {
        const parsed: unknown = JSON.parse(devicesJson)
        if (!Array.isArray(parsed)) {
          return NextResponse.json({ success: false, message: "设备数据格式不正确" }, { status: 400 })
        }
        devices = parsed as Record<string, unknown>[]
      } catch {
        return NextResponse.json({ success: false, message: "设备数据解析失败" }, { status: 400 })
      }
    }

    console.log(
      `📝 确认维修报告: ${batchId}, ${devices.length} 个设备, ` +
      `签字照片(文件): ${signedPhotoFileRaw instanceof File ? "有" : "无"}, ` +
      `签字照片(路径): ${signedPhotoPathRaw ? signedPhotoPathRaw : "无"}`
    )

    const pool = await getDbConnection()

    // ⚠️ 权限检查：只有状态为 PENDING_REPORTER_CONFIRM 时，现场人员才能上传签字
    const statusCheckResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1 ${DB_FIELDS.STATUS} AS CurrentStatus
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)
    
    const currentStatus = statusCheckResult.recordset[0]?.CurrentStatus ?? ""
    
    if (currentStatus !== TicketStatus.PENDING_REPORTER_CONFIRM) {
      return NextResponse.json(
        { 
          success: false, 
          message: `当前工单状态为"${currentStatus}"，无法上传签字。只有维修人员发送维修报告后（状态为"待现场确认"），现场人员才能上传签字照片。` 
        },
        { status: 403 }
      )
    }

    // ── 获取签字照片最终路径 ────────────────────────────────────────────────
    // 优先使用调用方已上传的持久化路径（Form B），否则处理 File（Form A）
    let signedPhotoPath: string | null = signedPhotoPathRaw || null

    if (!signedPhotoPath && signedPhotoFileRaw instanceof File) {
      try {
        const uploadDir = join(process.cwd(), "public", "uploads", "signed-reports")
        await mkdir(uploadDir, { recursive: true })

        const timestamp = Date.now()
        const randomStr = Math.random().toString(36).substring(7)
        const ext       = signedPhotoFileRaw.name.split(".").pop() || "jpg"
        const fileName  = `${batchId}-${timestamp}-${randomStr}.${ext}`
        const filePath  = join(uploadDir, fileName)

        const bytes  = await signedPhotoFileRaw.arrayBuffer()
        const buffer = Buffer.from(bytes)
        await writeFile(filePath, buffer)

        signedPhotoPath = `/uploads/signed-reports/${fileName}`
        console.log(`✅ 签字照片已保存（路由内部上传）: ${signedPhotoPath}`)
      } catch (uploadError: unknown) {
        const msg = uploadError instanceof Error ? uploadError.message : "文件写入失败"
        console.error("❌ 签字照片上传失败:", uploadError)
        return NextResponse.json({ success: false, message: `签字照片上传失败：${msg}` }, { status: 500 })
      }
    }

    // ── 辅助：写入操作日志 ────────────────────────────────────────────────────
    const writeHistory = async (description: string) => {
      try {
        let operatorName = "现场人员"
        if (userIdCookie) {
          const userResult = await pool
            .request()
            .input("userId", Number(userIdCookie))
            .query("SELECT TOP 1 RealName, Username FROM Users WHERE UserID = @userId")
          operatorName =
            (userResult.recordset[0]?.RealName as string | undefined) ||
            (userResult.recordset[0]?.Username as string | undefined) ||
            operatorName
        }
        await pool
          .request()
          .input("batchId",      batchId)
          .input("actionType",   TicketActionType.REPORTER_CONFIRMED)
          .input("operatorId",   userIdCookie ? Number(userIdCookie) : null)
          .input("operatorName", operatorName)
          .input("description",  description)
          .input("createdAt",    new Date())
          .query(`
            INSERT INTO Repair_Ticket_History (
              BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt
            ) VALUES (
              @batchId, @actionType, @operatorId, @operatorName, @description, @createdAt
            )
          `)
        console.log("✅ [Reporter Confirm] 操作记录已写入 Repair_Ticket_History")
      } catch (historyErr: unknown) {
        const msg = historyErr instanceof Error ? historyErr.message : "未知错误"
        console.error(`❌ [Reporter Confirm] 写入操作记录失败（非致命）: ${msg}`)
      }
    }

    // ── 分支 1：仅上传签字照片（devices 为空）────────────────────────────────
    if (signedPhotoPath && devices.length === 0) {
      console.log(`📸 仅上传签字照片，更新批次 ${batchId} 下所有设备→ ${TicketStatus.TECHNICIAN_REPAIRING}`)

      await pool
        .request()
        .input("batchId",   batchId)
        .input("signedPhoto", signedPhotoPath)
        .input("newStatus",   TicketStatus.TECHNICIAN_REPAIRING)
        .query(`
          UPDATE Repair_Tickets
          SET
            ${DB_FIELDS.SIGNED_REPORT_PHOTO} = @signedPhoto,
            ${DB_FIELDS.STATUS}              = @newStatus,
            ReporterConfirmedAt              = GETUTCDATE()
          WHERE ${DB_FIELDS.BATCH_ID} = @batchId
        `)

      console.log("✅ 签字照片更新成功，状态已变更为维修进行中")
      await writeHistory("现场人员上传签字凭证，确认维修方案")

      return NextResponse.json({
        success: true,
        message: "签字照片已上传，维修人员可以开始维修",
      })
    }

    // ── 分支 2：设备确认（含或不含签字照片）────────────────────────────────
    if (devices.length > 0) {
      for (const device of devices) {
        const deviceId = device.id as number | string | undefined

        if (!deviceId) {
          console.warn("设备ID为空，跳过")
          continue
        }

        // 读取当前 RepairReportContent
        const currentResult = await pool
          .request()
          .input("deviceId", deviceId)
          .query(`
            SELECT RepairReportContent
            FROM Repair_Tickets
            WHERE ${DB_FIELDS.ID} = @deviceId
          `)

        let currentContent: Record<string, unknown> = {}
        try {
          const raw = currentResult.recordset[0]?.RepairReportContent as string | undefined
          if (raw) currentContent = JSON.parse(raw) as Record<string, unknown>
        } catch {
          console.error("解析当前维修报告内容失败")
        }

        const updatedContent: Record<string, unknown> = {
          ...currentContent,
          willReturn:  device.willReturn  !== undefined ? device.willReturn  : true,
          isCompleted: device.isCompleted !== undefined ? device.isCompleted : false,
        }

        const updateRequest = pool
          .request()
          .input("deviceId",     deviceId)
          .input("reportContent", JSON.stringify(updatedContent))

        let updateQuery = `
          UPDATE Repair_Tickets
          SET RepairReportContent = @reportContent
        `

        if (signedPhotoPath) {
          updateRequest.input("signedPhoto", signedPhotoPath)
          updateQuery += `, ${DB_FIELDS.SIGNED_REPORT_PHOTO} = @signedPhoto`
        }
        updateQuery += ` WHERE ${DB_FIELDS.ID} = @deviceId`

        await updateRequest.query(updateQuery)
      }

      // 有签字照片 → 推进批次状态
      if (signedPhotoPath) {
        await pool
          .request()
          .input("batchId",   batchId)
          .input("newStatus", TicketStatus.TECHNICIAN_REPAIRING)
          .query(`
            UPDATE Repair_Tickets
            SET
              ${DB_FIELDS.STATUS} = @newStatus,
              ReporterConfirmedAt = GETUTCDATE()
            WHERE ${DB_FIELDS.BATCH_ID} = @batchId
          `)
        await writeHistory("现场人员上传签字凭证，确认维修方案")
      }

      const allCompleted = devices.every(d => d.isCompleted === true)
      console.log("✅ 确认信息更新成功")

      return NextResponse.json({
        success: true,
        message: signedPhotoPath
          ? "确认提交成功！签字照片已上传"
          : (allCompleted
            ? "确认提交成功！工单已流转至商务处理"
            : "确认信息已保存"),
      })
    }

    // ── 既无签字照片也无设备数据 ─────────────────────────────────────────────
    return NextResponse.json({ success: false, message: "没有需要更新的数据" }, { status: 400 })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "更新失败"
    console.error("现场确认更新失败:", error)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
