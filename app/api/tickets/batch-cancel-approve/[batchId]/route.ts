import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// POST /api/tickets/batch-cancel-approve/[batchId]
// 商务/管理员审批取消申请
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const body = await request.json()
    const { approve } = body

    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次号不能为空" },
        { status: 400 }
      )
    }

    // 验证用户权限（只有商务人员和管理员可以审批取消申请）
    const authCheck = await checkUserRole([UserRole.BUSINESS, UserRole.ADMIN])
    if (isErrorResponse(authCheck)) {
      console.error("❌ [批准取消] 权限验证失败")
      return authCheck
    }

    console.log("✅ [批准取消] 权限验证通过", { 
      userId: authCheck.userId, 
      role: authCheck.normalizedRole,
      approve 
    })

    const pool = await getDbConnection()

    // 查询批次中的所有设备
    const devicesResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}, CancelRequestStatus
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (devicesResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次工单不存在或已被删除" },
        { status: 404 }
      )
    }

    const devices = devicesResult.recordset

    // 检查是否有待审批的取消申请
    const hasPendingCancelRequest = devices.some((d: any) => {
      return d.CancelRequestStatus === "Pending"
    })

    if (!hasPendingCancelRequest) {
      return NextResponse.json(
        { success: false, message: "批次中没有待审批的取消申请" },
        { status: 400 }
      )
    }

    // 获取操作人姓名（从数据库查询）
    const userResult = await pool
      .request()
      .input("userId", authCheck.userId)
      .query(`SELECT TOP 1 RealName, Username FROM Users WHERE UserID = @userId`)
    
    const operatorName = userResult.recordset[0]?.RealName || userResult.recordset[0]?.Username || "未知"

    if (approve) {
      // 批准取消申请：将所有设备状态更新为 Cancelled
      console.log(`🔄 [批准取消] 开始批准取消 ${devices.length} 台设备...`)
      const updatePromises = devices.map((device: any) => {
        const deviceId = device[DB_FIELDS.ID] || device.Id
        return pool
          .request()
          .input("ticketId", deviceId)
          .input("cancelApprovedBy", operatorName)
          .input("cancelApprovedDate", new Date())
          .query(`
            UPDATE Repair_Tickets
            SET 
              ${DB_FIELDS.STATUS} = 'Cancelled',
              CancelRequestStatus = 'Approved',
              CancelApprovedBy = @cancelApprovedBy,
              CancelApprovedDate = @cancelApprovedDate,
              ${DB_FIELDS.UPDATED_AT} = GETUTCDATE()
            WHERE ${DB_FIELDS.ID} = @ticketId
          `)
      })

      await Promise.all(updatePromises)
      console.log(`✅ [批准取消] 批准完成`)

      return NextResponse.json({
        success: true,
        message: `批次工单取消申请已批准，共 ${devices.length} 台设备已取消`,
        data: {
          batchId,
          deviceCount: devices.length
        }
      })
    } else {
      // 拒绝取消申请：将 CancelRequestStatus 更新为 Rejected
      console.log(`🔄 [拒绝取消] 开始拒绝取消申请 ${devices.length} 台设备...`)
      const updatePromises = devices.map((device: any) => {
        const deviceId = device[DB_FIELDS.ID] || device.Id
        return pool
          .request()
          .input("ticketId", deviceId)
          .input("cancelApprovedBy", operatorName)
          .input("cancelApprovedDate", new Date())
          .query(`
            UPDATE Repair_Tickets
            SET 
              CancelRequestStatus = 'Rejected',
              CancelApprovedBy = @cancelApprovedBy,
              CancelApprovedDate = @cancelApprovedDate,
              ${DB_FIELDS.UPDATED_AT} = GETUTCDATE()
            WHERE ${DB_FIELDS.ID} = @ticketId
          `)
      })

      await Promise.all(updatePromises)
      console.log(`✅ [拒绝取消] 拒绝完成`)

      return NextResponse.json({
        success: true,
        message: `批次工单取消申请已拒绝，共 ${devices.length} 台设备继续正常流程`,
        data: {
          batchId,
          deviceCount: devices.length
        }
      })
    }

  } catch (error: unknown) {
    console.error("❌ [批准取消] 处理失败:", error)
    const errorMessage = error instanceof Error ? error.message : "处理取消申请失败"
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage
      },
      { status: 500 }
    )
  }
}
