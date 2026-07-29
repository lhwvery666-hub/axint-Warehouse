import { NextResponse } from "next/server";
import * as sql from "mssql";
import { getDbConnection } from "@/lib/db-config";
import { cookies } from "next/headers";
import { TicketStatus, DB_FIELDS, TicketActionType, UserRole } from "@/lib/enums";
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils";
import { API_DEBUG_MESSAGES, API_ERROR_MESSAGES, API_SUCCESS_MESSAGES } from "@/lib/api-messages";
import { prisma } from "@/lib/prisma";
import { generateSequentialBatchId } from "@/lib/batch-number";

// ==================== 类型定义 ====================

interface BatchItem {
  deviceSn?: string
  productModel?: string
  modelName?: string
  faultDesc?: string
  category?: string
  subCategory?: string
  quantity?: number
  materialCode?: string
  courierInfo?: string
  courierCompany?: string
}

interface CustomerInfo {
  name: string
  contact: string
  phone: string
  address?: string
  project?: string
  receivedDate?: string
}

// POST /api/tickets/batch
// 批量创建维修工单（使用 sql.Transaction 保证原子性）
export async function POST(request: Request) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER]);
  if (isErrorResponse(authResult)) return authResult;

  try {
    const body = await request.json();
    const { customerInfo, items }: { customerInfo: CustomerInfo; items: BatchItem[] } = body;

    // 🔍 调试
    console.log(`📥 [API] ${API_DEBUG_MESSAGES.receivedRequestBody}:`, JSON.stringify(body, null, 2));
    console.log(`📥 [API] ${API_DEBUG_MESSAGES.receivedCustomerInfo}:`, JSON.stringify(customerInfo, null, 2));
    console.log(`📥 [API] ${API_DEBUG_MESSAGES.receivedItemSample}:`, items?.[0] ? JSON.stringify(items[0], null, 2) : API_DEBUG_MESSAGES.noItems);

    // ── 输入校验 ──────────────────────────────────────────────────

    if (!customerInfo || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: API_ERROR_MESSAGES.customerInfoEmpty },
        { status: 400 }
      );
    }

    if (!customerInfo.name || !customerInfo.contact || !customerInfo.phone) {
      return NextResponse.json(
        { success: false, message: API_ERROR_MESSAGES.customerInfoRequired },
        { status: 400 }
      );
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productModel || !item.deviceSn) {
        return NextResponse.json(
          { success: false, message: API_ERROR_MESSAGES.deviceInfoRequired(i) },
          { status: 400 }
        );
      }
    }

    // ✅ 防呆校验：拦截同一批次内的重复序列号
    // 注意：PENDING_VERIFY / PENDING 是"标签磨损/无法辨识"的特殊占位值，
    // 多台设备同时无法辨识属于正常情况，必须从查重范围中排除。
    const PENDING_PLACEHOLDERS = ["PENDING_VERIFY", "PENDING", "待验证"];
    const submittedSNs: string[] = items
      .map((item) => (item.deviceSn ?? "").trim())
      .filter((sn) => sn !== "" && !PENDING_PLACEHOLDERS.includes(sn));

    const duplicateSNs = submittedSNs.filter(
      (sn, index) => submittedSNs.indexOf(sn) !== index
    );
    const uniqueDuplicates = [...new Set(duplicateSNs)];

    if (uniqueDuplicates.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `提交失败：在您提交的设备清单中，发现了重复的序列号 [${uniqueDuplicates.join("、")}]，请检查后重试。`,
        },
        { status: 400 }
      );
    }

    // ── 鉴权 ──────────────────────────────────────────────────────

    // ✅ Rule 5 — 路由保护：必须登录才能创建工单
    const cookieStore = await cookies();
    const userIdCookie = cookieStore.get("userId")?.value ?? null;
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: API_ERROR_MESSAGES.notLoggedIn },
        { status: 401 }
      );
    }

    // ── 准备工作 ──────────────────────────────────────────────────

    const pool = await getDbConnection();

    // ⚠️ 曾经的实现：用当前时间戳后4位拼接批次号（WO+YYMMDD+时间戳后4位），
    // 后缀每10秒循环一次，同一天内并发创建极易撞号，且无数据库层唯一约束兜底。
    // 修复：改用并发安全的顺序批次号生成器（sp_getapplock + 独立序列表原子自增），
    // 格式不变为 WO+YYMMDD+0001，保证同一天内绝对不重复、按创建顺序递增。
    const batchId = await generateSequentialBatchId(pool);

    // 动态检查表结构（读取操作，事务外执行）
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `);
    const columnNames: string[] = columnsResult.recordset.map(
      (row: { COLUMN_NAME: string }) => row.COLUMN_NAME
    );

    const fieldExists = (fieldName: string) =>
      columnNames.some((c) => c.toLowerCase() === fieldName.toLowerCase());

    const hasBatchId         = fieldExists(DB_FIELDS.BATCH_ID);
    const hasProjectName     = fieldExists(DB_FIELDS.PROJECT_NAME);
    const hasContactInfo     = fieldExists(DB_FIELDS.CONTACT_INFO);
    const hasSenderAddress   = fieldExists(DB_FIELDS.SENDER_ADDRESS);
    const hasReceivedDate    = fieldExists(DB_FIELDS.RECEIVED_DATE);
    const hasReportByUserID  = fieldExists(DB_FIELDS.REPORT_BY_USER_ID);
    const hasReportTime      = fieldExists(DB_FIELDS.REPORT_TIME);
    const hasSubmitDate      = fieldExists(DB_FIELDS.SUBMIT_DATE);
    const hasModelName       = fieldExists(DB_FIELDS.MODEL_NAME);
    const hasFaultDescription = fieldExists(DB_FIELDS.FAULT_DESCRIPTION);
    const hasProblem         = fieldExists(DB_FIELDS.PROBLEM);
    const hasCategory        = fieldExists(DB_FIELDS.CATEGORY);
    const hasSubCategory     = fieldExists(DB_FIELDS.SUB_CATEGORY);
    const hasQuantity        = fieldExists(DB_FIELDS.QUANTITY);
    const hasProjectLocation = fieldExists(DB_FIELDS.PROJECT_LOCATION);
    const hasMaterialCode    = fieldExists(DB_FIELDS.MATERIAL_CODE);
    const hasTrackingNumberIn = fieldExists(DB_FIELDS.TRACKING_NUMBER_IN);
    const hasCourierCompany  = fieldExists(DB_FIELDS.COURIER_COMPANY);
    const hasCourierNumber   = fieldExists(DB_FIELDS.COURIER_NUMBER);

    const idColumn = columnNames.find((c) =>
      c.toLowerCase() === "id" ||
      c.toLowerCase() === "ticketid" ||
      c.toLowerCase() === "repair_ticket_id"
    ) ?? columnNames[0];

    const receivedDate = customerInfo.receivedDate
      ? new Date(customerInfo.receivedDate)
      : new Date();

    // ── 原子事务：批量 INSERT ─────────────────────────────────────
    // ✅ Rule 4 — 事务强制要求：多条记录写入必须在同一个事务中，任一失败全部回滚
    const createdTicketIds: string[] = [];

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let transactionActive = true;

    try {
      for (const item of items) {
        console.log(`🔧 [API] ${API_DEBUG_MESSAGES.processingDevice}:`, JSON.stringify(item, null, 2));

        let insertFields: string[] = ["DeviceSN", "Status"];
        let insertValues: string[] = ["@deviceSn", "@status"];

        // ✅ 每次循环都创建绑定到事务的 Request，保证原子性
        const insertRequest = new sql.Request(transaction);
        insertRequest.input("deviceSn", item.deviceSn);
        insertRequest.input("status", TicketStatus.WAREHOUSE_CONFIRMING);

        console.log(`🔧 [API] ${API_DEBUG_MESSAGES.deviceSnValue}:`, item.deviceSn);

        if (hasBatchId) {
          insertFields.push("BatchId"); insertValues.push("@batchId");
          insertRequest.input("batchId", batchId);
        }
        if (hasProjectName) {
          insertFields.push("ProjectName"); insertValues.push("@projectName");
          insertRequest.input("projectName", customerInfo.name);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('ProjectName', customerInfo.name)}`);
        } else {
          console.warn(`⚠️ [API] ${API_DEBUG_MESSAGES.fieldNotExists('ProjectName')}`);
        }
        if (hasContactInfo) {
          insertFields.push("ContactInfo"); insertValues.push("@contactInfo");
          const contactInfoValue = `${customerInfo.contact} ${customerInfo.phone}`;
          insertRequest.input("contactInfo", contactInfoValue);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('ContactInfo', contactInfoValue)}`);
        } else {
          console.warn(`⚠️ [API] ${API_DEBUG_MESSAGES.fieldNotExists('ContactInfo')}`);
        }
        if (hasSenderAddress) {
          insertFields.push("SenderAddress"); insertValues.push("@senderAddress");
          insertRequest.input("senderAddress", customerInfo.address ?? null);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('SenderAddress', customerInfo.address)}`);
        } else {
          console.warn(`⚠️ [API] ${API_DEBUG_MESSAGES.fieldNotExists('SenderAddress')}`);
        }
        if (hasReceivedDate) {
          insertFields.push("ReceivedDate"); insertValues.push("@receivedDate");
          insertRequest.input("receivedDate", receivedDate);
        }
        if (hasReportByUserID) {
          insertFields.push("ReportByUserID"); insertValues.push("@reportByUserID");
          insertRequest.input("reportByUserID", Number(userIdCookie));
        }
        if (hasReportTime) {
          insertFields.push("ReportTime"); insertValues.push("@reportTime");
          insertRequest.input("reportTime", new Date());
        }
        if (hasSubmitDate) {
          insertFields.push("SubmitDate"); insertValues.push("@submitDate");
          insertRequest.input("submitDate", new Date());
        }
        if (hasModelName) {
          insertFields.push("ModelName"); insertValues.push("@modelName");
          insertRequest.input("modelName", item.modelName ?? item.productModel ?? "");
        }
        if (hasCategory) {
          insertFields.push("Category"); insertValues.push("@category");
          insertRequest.input("category", item.category ?? null);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('Category', item.category)}`);
        }
        if (hasSubCategory) {
          insertFields.push("SubCategory"); insertValues.push("@subCategory");
          insertRequest.input("subCategory", item.subCategory ?? null);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('SubCategory', item.subCategory)}`);
        }
        if (hasQuantity) {
          insertFields.push("Quantity"); insertValues.push("@quantity");
          insertRequest.input("quantity", item.quantity ?? 1);
        }
        if (hasProblem) {
          insertFields.push("Problem"); insertValues.push("@problem");
          insertRequest.input("problem", item.faultDesc ?? "");
        }
        if (hasFaultDescription) {
          insertFields.push("FaultDescription"); insertValues.push("@faultDescription");
          insertRequest.input("faultDescription", item.faultDesc ?? "");
        }
        if (hasProjectLocation) {
          insertFields.push("ProjectLocation"); insertValues.push("@projectLocation");
          insertRequest.input("projectLocation", customerInfo.project ?? null);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('ProjectLocation', customerInfo.project)}`);
        }
        if (hasMaterialCode) {
          insertFields.push("MaterialCode"); insertValues.push("@materialCode");
          insertRequest.input("materialCode", item.materialCode ?? null);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('MaterialCode', item.materialCode)}`);
        }
        if (hasTrackingNumberIn) {
          const cleanedTrackingNumber = item.courierInfo ? item.courierInfo.replace(/\s+/g, '') : null;
          insertFields.push("TrackingNumber_In"); insertValues.push("@trackingNumberIn");
          insertRequest.input("trackingNumberIn", cleanedTrackingNumber);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('TrackingNumber_In', cleanedTrackingNumber)}`);
        }
        if (hasCourierCompany) {
          insertFields.push("CourierCompany"); insertValues.push("@courierCompany");
          insertRequest.input("courierCompany", item.courierCompany ?? null);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('CourierCompany', item.courierCompany)}`);
        }
        if (hasCourierNumber) {
          insertFields.push("CourierNumber"); insertValues.push("@courierNumber");
          insertRequest.input("courierNumber", item.courierInfo ?? null);
          console.log(`✅ [API] ${API_DEBUG_MESSAGES.addingField('CourierNumber', item.courierInfo)}`);
        }

        const insertQuery = `
          INSERT INTO Repair_Tickets (${insertFields.join(", ")})
          VALUES (${insertValues.join(", ")})
        `;

        console.log(`📝 [API] ${API_DEBUG_MESSAGES.preparingSql}:`);
        console.log(`   ${API_DEBUG_MESSAGES.insertFields}:`, insertFields.join(", "));
        console.log(`   ${API_DEBUG_MESSAGES.sqlQuery}:`, insertQuery);
        console.log(`🚀 [API] ${API_DEBUG_MESSAGES.insertSuccess} - 开始执行`);

        // ✅ 插入失败直接抛出，由外层 catch 回滚整个事务
        await insertRequest.query(insertQuery);
        console.log(`✅ [API] ${API_DEBUG_MESSAGES.insertSuccess}`);

        // 在同一事务内查询刚插入的 ID（未提交的行在同一事务内可见）
        const findResult = await new sql.Request(transaction)
          .input("deviceSn", item.deviceSn)
          .input("batchId", batchId)
          .query(`
            SELECT TOP 1 ${idColumn} as ID
            FROM Repair_Tickets
            WHERE DeviceSN = @deviceSn AND BatchId = @batchId
            ORDER BY ${hasReportTime ? "ReportTime" : idColumn} DESC
          `);

        if (findResult.recordset?.length > 0) {
          const ticketId = String(findResult.recordset[0].ID ?? "");
          if (ticketId) {
            createdTicketIds.push(ticketId);
            console.log(`✅ [API] ${API_DEBUG_MESSAGES.foundTicketId(ticketId)}`);
          } else {
            console.warn(`⚠️ [API] ${API_DEBUG_MESSAGES.ticketNotFound} - ID为空`);
          }
        } else {
          console.warn(`⚠️ [API] ${API_DEBUG_MESSAGES.ticketNotFound} - 查询结果为空`);
        }
      }

      // 所有设备均插入成功，提交事务
      await transaction.commit();
      transactionActive = false;
      console.log(`✅ [API] 所有工单创建成功，共 ${createdTicketIds.length} 个，事务已提交`);

    } catch (txError: unknown) {
      // ✅ 安全回滚：立即置 transactionActive = false，防止二次 rollback 崩溃
      if (transactionActive) {
        try {
          await transaction.rollback();
        } catch (rollbackErr: unknown) {
          console.error("❌ [API] 事务回滚失败:", rollbackErr instanceof Error ? rollbackErr.message : rollbackErr);
        }
        transactionActive = false;
      }
      const errMsg = txError instanceof Error ? txError.message : API_ERROR_MESSAGES.unknownError;
      console.error("❌ [API] 批次工单创建事务失败，已全部回滚:", errMsg);
      return NextResponse.json(
        {
          success: false,
          message: `提交失败：${errMsg}。所有已创建的记录已自动回滚，数据库保持一致。`,
          error: errMsg,
        },
        { status: 500 }
      );
    }

    // ── 非关键操作（事务外，失败不影响主流程）─────────────────────

    // 记录操作日志到 Repair_Ticket_History
    try {
      const userResult = await pool
        .request()
        .input("userId", Number(userIdCookie))
        .query(`SELECT TOP 1 RealName, Username FROM Users WHERE UserID = @userId`)

      const operatorName: string =
        (userResult.recordset[0] as { RealName?: string; Username?: string } | undefined)?.RealName
        ?? (userResult.recordset[0] as { RealName?: string; Username?: string } | undefined)?.Username
        ?? "现场人员";

      await pool
        .request()
        .input("batchId", batchId)
        .input("actionType", TicketActionType.BATCH_CREATED)
        .input("operatorId", Number(userIdCookie))
        .input("operatorName", operatorName)
        .input("description", `创建批次工单（设备数量：${createdTicketIds.length}）`)
        .input("createdAt", new Date())
        .query(`
          INSERT INTO Repair_Ticket_History (
            BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt
          )
          VALUES (
            @batchId, @actionType, @operatorId, @operatorName, @description, @createdAt
          )
        `);

      console.log(`✅ [API] 操作记录已保存到 Repair_Ticket_History`);
    } catch (historyLogError: unknown) {
      console.error('❌ [API] 保存操作记录失败（非关键，主流程不受影响）:',
        historyLogError instanceof Error ? historyLogError.message : historyLogError);
    }

    // 自动保存客户信息历史（Prisma，完全非关键）
    try {
      const existing = await prisma.customer_History.findFirst({
        where: { userId: Number(userIdCookie), customerName: customerInfo.name },
      });

      if (existing) {
        await prisma.customer_History.update({
          where: { id: existing.id },
          data: {
            contactPerson: customerInfo.contact,
            contactPhone: customerInfo.phone,
            address: customerInfo.address ?? null,
            lastUsedAt: new Date(),
            useCount: { increment: 1 },
          },
        });
      } else {
        await prisma.customer_History.create({
          data: {
            userId: Number(userIdCookie),
            customerName: customerInfo.name,
            contactPerson: customerInfo.contact,
            contactPhone: customerInfo.phone,
            address: customerInfo.address ?? null,
            useCount: 1,
          },
        });
      }
    } catch (historyError: unknown) {
      console.error('保存客户历史记录失败（非关键）:',
        historyError instanceof Error ? historyError.message : historyError);
    }

    return NextResponse.json({
      success: true,
      message: API_SUCCESS_MESSAGES.batchCreated(createdTicketIds.length),
      data: {
        batchId,
        ticketIds: createdTicketIds,
        count: createdTicketIds.length,
      },
    });

  } catch (error: unknown) {
    console.error(API_ERROR_MESSAGES.batchCreateFailed, error);
    return NextResponse.json(
      {
        success: false,
        message: API_ERROR_MESSAGES.batchCreateError,
        error: error instanceof Error ? error.message : API_ERROR_MESSAGES.unknownError,
      },
      { status: 500 }
    );
  }
}
