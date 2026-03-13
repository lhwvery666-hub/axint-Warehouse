import { NextResponse } from "next/server"
import { DB_FIELDS, OperationLogType, OPERATION_LOG_TYPE_LABELS, UserRole, TicketActionType } from "@/lib/enums"
import { checkUserRole, isErrorResponse, getCurrentUserRole } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// ==================== 类型定义 ====================
/**
 * 操作日志接口
 */
interface OperationLog {
  type: OperationLogType
  time: string
  operator: string
  description: string
}

/**
 * 数据库查询结果接口
 */
interface BatchOperationRecord {
  CreatedAt: Date
  ReportedBy: string | null
  SubmitDate: Date | null
  WarehouseConfirmedAt: Date | null
  WarehouseConfirmedBy: string | null
  SignedPhotoViewedAt: Date | null
  SignedPhotoViewedBy: string | null
  ReporterConfirmedAt: Date | null
  TechnicianCompletedAt: Date | null
  TechnicianCompletedBy: string | null
  BusinessReviewedAt: Date | null
  BusinessReviewedBy: string | null
  WarehouseShippedAt: Date | null
  WarehouseShippedBy: string | null
  CurrentStatus: string
}

// ==================== API 路由 ====================
/**
 * GET /api/tickets/batch-operation-logs/[batchId]
 * 获取批次工单的操作记录
 * 
 * @description 返回批次工单的关键操作时间线，包括创建、仓库确认、维修完成、商务审核、发货等
 * @permission ADMIN, WAREHOUSE, TECHNICIAN, BUSINESS
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    // ==================== 权限验证 ====================
    const authResult = await checkUserRole([
      UserRole.ADMIN,
      UserRole.WAREHOUSE,
      UserRole.TECHNICIAN,
      UserRole.BUSINESS,
      UserRole.REPORTER,
    ])
    if (isErrorResponse(authResult)) {
      return authResult
    }

    // ==================== 参数验证 ====================
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    // ==================== 数据库查询 ====================
    // 从 Repair_Ticket_History 表获取真实的操作记录（使用 Prisma ORM，字段名使用驼峰写法）
    const historyLogs = await prisma.repair_Ticket_History.findMany({
      where: { batchId },
      orderBy: { createdAt: "desc" },
      select: {
        actionType: true,
        createdAt: true,
        operatorName: true,
        description: true,
      },
    })

    // 如果没有历史记录，从 Repair_Tickets 表构建基础记录
    if (historyLogs.length === 0) {
      // 回退到旧逻辑：从 Repair_Tickets 表获取时间戳
      const result = await prisma.$queryRaw<BatchOperationRecord[]>(Prisma.sql`
        SELECT TOP 1
          ${Prisma.raw(DB_FIELDS.CREATED_AT)} as CreatedAt,
          ${Prisma.raw(DB_FIELDS.REPORTED_BY)} as ReportedBy,
          ${Prisma.raw(DB_FIELDS.SUBMIT_DATE)} as SubmitDate,
          ${Prisma.raw(DB_FIELDS.WAREHOUSE_CONFIRMED_AT)} as WarehouseConfirmedAt,
          ${Prisma.raw(DB_FIELDS.WAREHOUSE_CONFIRMED_BY)} as WarehouseConfirmedBy,
          ${Prisma.raw(DB_FIELDS.SIGNED_PHOTO_VIEWED_AT)} as SignedPhotoViewedAt,
          ${Prisma.raw(DB_FIELDS.SIGNED_PHOTO_VIEWED_BY)} as SignedPhotoViewedBy,
          ${Prisma.raw(DB_FIELDS.REPORTER_CONFIRMED_AT)} as ReporterConfirmedAt,
          ${Prisma.raw(DB_FIELDS.TECHNICIAN_COMPLETED_AT)} as TechnicianCompletedAt,
          ${Prisma.raw(DB_FIELDS.TECHNICIAN_COMPLETED_BY)} as TechnicianCompletedBy,
          ${Prisma.raw(DB_FIELDS.BUSINESS_REVIEWED_AT)} as BusinessReviewedAt,
          ${Prisma.raw(DB_FIELDS.BUSINESS_REVIEWED_BY)} as BusinessReviewedBy,
          ${Prisma.raw(DB_FIELDS.WAREHOUSE_SHIPPED_AT)} as WarehouseShippedAt,
          ${Prisma.raw(DB_FIELDS.WAREHOUSE_SHIPPED_BY)} as WarehouseShippedBy,
          ${Prisma.raw(DB_FIELDS.STATUS)} as CurrentStatus
        FROM Repair_Tickets
        WHERE ${Prisma.raw(DB_FIELDS.BATCH_ID)} = ${batchId}
        ORDER BY ${Prisma.raw(DB_FIELDS.CREATED_AT)} DESC
      `)

      if (result.length === 0) {
        return NextResponse.json(
          { success: false, message: "批次不存在" },
          { status: 404 }
        )
      }

      const data = result[0]

      // ==================== 构建操作记录（旧逻辑） ====================
      const operations: OperationLog[] = []

      // 1. 工单创建（使用枚举）
      operations.push({
        type: OperationLogType.CREATED,
        time: data.CreatedAt.toISOString(),
        operator: data.ReportedBy || "现场人员",
        description: OPERATION_LOG_TYPE_LABELS[OperationLogType.CREATED]
      })

      // 2. 工单提交（现场人员完成填写）
      if (data.SubmitDate) {
        operations.push({
          type: OperationLogType.SUBMITTED,
          time: data.SubmitDate.toISOString(),
          operator: data.ReportedBy || "现场人员",
          description: OPERATION_LOG_TYPE_LABELS[OperationLogType.SUBMITTED]
        })
      }

      // 3. 仓库确认
      if (data.WarehouseConfirmedAt) {
        operations.push({
          type: OperationLogType.WAREHOUSE_CONFIRMED,
          time: data.WarehouseConfirmedAt.toISOString(),
          operator: data.WarehouseConfirmedBy || "仓库管理员",
          description: OPERATION_LOG_TYPE_LABELS[OperationLogType.WAREHOUSE_CONFIRMED]
        })
      }

      // 4. 维修报告生成（维修人员填写完成，发送现场签字）
      if (data.SignedPhotoViewedAt) {
        operations.push({
          type: OperationLogType.REPAIR_REPORT_GENERATED,
          time: data.SignedPhotoViewedAt.toISOString(),
          operator: data.SignedPhotoViewedBy || "维修人员",
          description: OPERATION_LOG_TYPE_LABELS[OperationLogType.REPAIR_REPORT_GENERATED]
        })
      }

      // 5. 现场确认（签字回传）
      if (data.ReporterConfirmedAt) {
        operations.push({
          type: OperationLogType.REPORTER_CONFIRMED,
          time: data.ReporterConfirmedAt.toISOString(),
          operator: data.ReportedBy || "现场人员",
          description: OPERATION_LOG_TYPE_LABELS[OperationLogType.REPORTER_CONFIRMED]
        })
      }

      // 6. 维修完成
      if (data.TechnicianCompletedAt) {
        operations.push({
          type: OperationLogType.TECHNICIAN_COMPLETED,
          time: data.TechnicianCompletedAt.toISOString(),
          operator: data.TechnicianCompletedBy || "维修人员",
          description: OPERATION_LOG_TYPE_LABELS[OperationLogType.TECHNICIAN_COMPLETED]
        })
      }

      // 7. 商务审核
      if (data.BusinessReviewedAt) {
        operations.push({
          type: OperationLogType.BUSINESS_REVIEWED,
          time: data.BusinessReviewedAt.toISOString(),
          operator: data.BusinessReviewedBy || "商务人员",
          description: OPERATION_LOG_TYPE_LABELS[OperationLogType.BUSINESS_REVIEWED]
        })
      }

      // 8. 仓库发货
      if (data.WarehouseShippedAt) {
        operations.push({
          type: OperationLogType.WAREHOUSE_SHIPPED,
          time: data.WarehouseShippedAt.toISOString(),
          operator: data.WarehouseShippedBy || "仓库管理员",
          description: OPERATION_LOG_TYPE_LABELS[OperationLogType.WAREHOUSE_SHIPPED]
        })
      }

      // 按时间排序（最新的在最前面）
      operations.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

      // ==================== 返回结果 ====================
      return NextResponse.json({
        success: true,
        data: {
          batchId,
          currentStatus: data.CurrentStatus,
          operations
        }
      })
    }

    // ==================== 从 Repair_Ticket_History 构建操作记录 ====================
    
    // 获取当前用户角色（用于过滤操作记录）
    const userInfo = await getCurrentUserRole()
    const isReporter = userInfo?.normalizedRole === UserRole.REPORTER
    const isTechnician = userInfo?.normalizedRole === UserRole.TECHNICIAN
    
    /**
     * 将 TicketActionType 精确映射为 OperationLogType（用于前端图标和标签渲染）
     * 新增精确的各节点动作类型，保留旧兼容逻辑
     */
    const mapActionTypeToOperationLogType = (actionType: string): OperationLogType => {
      switch (actionType) {
        // 精确节点映射（新版）
        case TicketActionType.BATCH_CREATED:
          return OperationLogType.CREATED
        case TicketActionType.WAREHOUSE_CONFIRMED:
          return OperationLogType.WAREHOUSE_CONFIRMED
        case TicketActionType.REPAIR_REPORT_SUBMITTED:
          return OperationLogType.REPAIR_REPORT_GENERATED
        case TicketActionType.REPORTER_CONFIRMED:
          return OperationLogType.REPORTER_CONFIRMED
        case TicketActionType.TECHNICIAN_COMPLETED:
          return OperationLogType.TECHNICIAN_COMPLETED
        case TicketActionType.BUSINESS_REVIEWED:
          return OperationLogType.BUSINESS_REVIEWED
        case TicketActionType.WAREHOUSE_SHIPPED:
          return OperationLogType.WAREHOUSE_SHIPPED
        // 兼容旧数据（STATUS_CHANGE 曾被仓库确认复用）
        case TicketActionType.STATUS_CHANGE:
          return OperationLogType.WAREHOUSE_CONFIRMED
        case TicketActionType.BATCH_UPDATED:
          return OperationLogType.CREATED
        case TicketActionType.MANUFACTURE_DATE_OVERRIDE:
          return OperationLogType.WAREHOUSE_CONFIRMED
        case TicketActionType.RMA_REQUEST:
          // 返厂维修申请使用 STATUS_CHANGE 类型（显示为状态变更图标）
          return OperationLogType.SUBMITTED
        default:
          // 如果 actionType 本身已经是有效的 OperationLogType 值，直接返回
          // 否则回退到 CREATED，确保不会渲染空白
          return (Object.values(OperationLogType) as string[]).includes(actionType)
            ? (actionType as OperationLogType)
            : OperationLogType.CREATED
      }
    }
    
    // 判断是否是返厂相关的操作记录（需要隐藏给现场人员，但维修人员、商务人员、仓库人员可见）
    const isRMAOperation = (record: { actionType: string; description: string | null }): boolean => {
      // 使用枚举值进行精确匹配
      if (record.actionType === TicketActionType.RMA_REQUEST) {
        return true
      }
      
      // 兼容性检查：检查描述中是否包含返厂相关关键词
      const descriptionLower = record.description?.toLowerCase() || ""
      return descriptionLower.includes("返厂") ||
             descriptionLower.includes("factory") ||
             descriptionLower.includes("rma") ||
             descriptionLower.includes("返厂快递单号")
    }
    
    const operations: OperationLog[] = historyLogs
      .filter((record) => {
        // 现场人员：过滤掉返厂相关的操作记录（维修人员、商务人员、仓库人员、管理员可见）
        if (isReporter && isRMAOperation(record)) {
          return false
        }
        // 维修人员、商务人员、仓库人员、管理员都可以看到返厂记录
        return true
      })
      .map((record) => {
        const mappedType = mapActionTypeToOperationLogType(record.actionType)
        
        return {
          type: mappedType,
          time: record.createdAt
            ? record.createdAt.toISOString()
            : new Date().toISOString(),
          operator: record.operatorName || "系统操作",
          // 兼容：优先使用自定义描述，否则退回到枚举标签或原始 actionType
          description:
            record.description ||
            OPERATION_LOG_TYPE_LABELS[mappedType] ||
            record.actionType,
        }
      })

    // 获取当前状态
    const statusResult = await prisma.$queryRaw<{ CurrentStatus?: string }[]>(Prisma.sql`
      SELECT TOP 1 ${Prisma.raw(DB_FIELDS.STATUS)} as CurrentStatus
      FROM Repair_Tickets
      WHERE ${Prisma.raw(DB_FIELDS.BATCH_ID)} = ${batchId}
    `)

    const currentStatus = statusResult[0]?.CurrentStatus || "Unknown"

    // ==================== 返回结果 ====================
    return NextResponse.json({
      success: true,
      data: {
        batchId,
        currentStatus,
        operations
      }
    })

  } catch (error: unknown) {
    console.error("获取批次操作记录失败:", error)
    const errorMessage = error instanceof Error ? error.message : "获取操作记录失败"
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    )
  }
}
