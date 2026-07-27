import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, UserRole } from "@/lib/enums"
import { cookies } from "next/headers"

// GET /api/tickets/batch-devices/[batchId]
// 获取指定批次下的所有设备列表
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  try {
    // Promise.resolve 兼容 Next.js 新旧两种 params 形态（同步对象 或 异步 Promise）
    const resolvedParams = await Promise.resolve(context.params)

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    console.log(`📦 查询批次设备列表: ${batchId}`)

    const pool = await getDbConnection()

    // 动态检查字段是否存在
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const columnNames = columnsResult.recordset.map((row: Record<string, unknown>) => row.COLUMN_NAME as string)
    
    const hasManufactureDate = columnNames.some(c => c.toLowerCase() === 'manufacturedate')
    const hasWarrantyStatus = columnNames.some(c => c.toLowerCase() === 'warrantystatus')
    const hasWarrantyStatusOverride = columnNames.some(c => c.toLowerCase() === 'warrantystatusoverride')
    // 照片字段有两个历史列名：创建时写入 DeviceImages，更新时写入 DevicePhotos
    const hasDeviceImages = columnNames.some(c => c.toLowerCase() === 'deviceimages')
    const hasDevicePhotos = columnNames.some(c => c.toLowerCase() === 'devicephotos')
    const hasCancelRequestStatus = columnNames.some(c => c.toLowerCase() === 'cancelrequeststatus')
    const hasCancelRequestReason = columnNames.some(c => c.toLowerCase() === 'cancelrequestreason')
    const hasRevisionRequestedBy = columnNames.some(c => c.toLowerCase() === 'revisionrequestedby')
    const hasRevisionRequestReason = columnNames.some(c => c.toLowerCase() === 'revisionrequestreason')
    const hasRevisionRequestDate = columnNames.some(c => c.toLowerCase() === 'revisionrequestdate')
    const hasFactoryTrackingNum = columnNames.some(c => c.toLowerCase() === 'factorytrackingnum')
    const hasFactoryShipDate = columnNames.some(c => c.toLowerCase() === 'factoryshipdate')
    const hasArrivalDate = columnNames.some(c => c.toLowerCase() === 'arrivaldate')

    // 构建查询字段列表
    let selectFields = `
      ${DB_FIELDS.ID},
      ${DB_FIELDS.DEVICE_SN},
      ${DB_FIELDS.MODEL_NAME},
      ${DB_FIELDS.DEVICE_NAME},
      ${DB_FIELDS.STATUS},
      ${DB_FIELDS.PROBLEM},
      ${DB_FIELDS.MATERIAL_CODE},
      ${DB_FIELDS.FULL_SPEC},
      ${DB_FIELDS.FAULT_POINT},
      ${DB_FIELDS.CREATED_AT},
      ${DB_FIELDS.BATCH_ID},
      ${DB_FIELDS.SIGNED_REPORT_PHOTO},
      ${DB_FIELDS.SENDER_ADDRESS},
      ${DB_FIELDS.TRACKING_NUMBER_IN},
      ${DB_FIELDS.COURIER_COMPANY},
      ${DB_FIELDS.REPAIR_ACTION},
      RepairReportContent,
      ProjectLocation,
      ContactInfo,
      ProjectName,
      Quantity,
      Category,
      SubCategory
    `
    
    if (hasCancelRequestStatus) selectFields += ', CancelRequestStatus'
    if (hasCancelRequestReason) selectFields += ', CancelRequestReason'
    if (hasManufactureDate) selectFields += ', ManufactureDate'
    if (hasWarrantyStatus) selectFields += ', WarrantyStatus'
    if (hasWarrantyStatusOverride) selectFields += ', WarrantyStatusOverride'
    if (hasDeviceImages) selectFields += ', DeviceImages'
    if (hasDevicePhotos) selectFields += ', DevicePhotos'
    if (hasRevisionRequestedBy) selectFields += ', RevisionRequestedBy'
    if (hasRevisionRequestReason) selectFields += ', RevisionRequestReason'
    if (hasRevisionRequestDate) selectFields += ', RevisionRequestDate'
    if (hasFactoryTrackingNum) selectFields += ', FactoryTrackingNum'
    if (hasFactoryShipDate) selectFields += ', FactoryShipDate'
    if (hasArrivalDate) selectFields += ', ArrivalDate'

    // 查询该批次下的所有设备
    const result = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT ${selectFields}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
        ORDER BY ${DB_FIELDS.ID} ASC
      `)

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "未找到该批次的设备" },
        { status: 404 }
      )
    }

    // 格式化数据
    const devices = result.recordset.map((row: Record<string, unknown>) => ({
      id: row[DB_FIELDS.ID] || row.Id,
      deviceSerialNumber: row[DB_FIELDS.DEVICE_SN] || row.DeviceSN,
      modelName: row[DB_FIELDS.MODEL_NAME] || row.ModelName,
      deviceName: row[DB_FIELDS.DEVICE_NAME] || row.DeviceName,
      status: row[DB_FIELDS.STATUS] || row.Status,
      problem: row[DB_FIELDS.PROBLEM] || row.Problem,
      materialCode: row[DB_FIELDS.MATERIAL_CODE] || row.MaterialCode,
      fullSpec: row[DB_FIELDS.FULL_SPEC] || row.FullSpec,
      faultPoint: row[DB_FIELDS.FAULT_POINT] || row.FaultPoint,
      createdAt: row[DB_FIELDS.CREATED_AT] || row.CreatedAt,
      batchId: row[DB_FIELDS.BATCH_ID] || row.BatchId,
      cancelRequestStatus: hasCancelRequestStatus ? (row.CancelRequestStatus || null) : null,
      cancelRequestReason: hasCancelRequestReason ? (row.CancelRequestReason || null) : null,
      manufactureDate: hasManufactureDate ? (row.ManufactureDate || null) : null,
      arrivalDate: hasArrivalDate ? (row.ArrivalDate || null) : null,
      warrantyStatus: hasWarrantyStatus ? (row.WarrantyStatus || null) : null,
      warrantyStatusOverride: hasWarrantyStatusOverride ? (row.WarrantyStatusOverride || null) : null,
      // 兼容两列：创建时写入 DeviceImages，更新时写入 DevicePhotos，优先取有值的
      deviceImages: (hasDeviceImages ? (row.DeviceImages || null) : null)
        || (hasDevicePhotos ? (row.DevicePhotos || null) : null),
      repairAction: (row.RepairAction as string | null) || null,
      quantity: typeof row.Quantity === "number" ? row.Quantity : (parseInt(row.Quantity as string) || 1),
      finalOutcome: (() => {
        try {
          const raw = row.RepairReportContent as string | null
          if (!raw) return null
          const parsed = JSON.parse(raw) as Record<string, unknown>
          return (parsed.finalOutcome as string | null) ?? null
        } catch {
          return null
        }
      })(),
    }))

    // 获取批次的基础信息（从第一条记录中提取）
    let signedPhotoValue = result.recordset[0][DB_FIELDS.SIGNED_REPORT_PHOTO] || result.recordset[0].SignedReportPhoto || null;
    
    // 确保路径以 / 开头（兼容旧数据）
    if (signedPhotoValue && !signedPhotoValue.startsWith('/') && !signedPhotoValue.startsWith('http')) {
      signedPhotoValue = '/' + signedPhotoValue;
    }
    
    const batchInfo = {
      batchId: batchId,
      projectLocation: result.recordset[0].ProjectLocation || "",
      contactInfo: result.recordset[0].ContactInfo || "",
      projectName: result.recordset[0].ProjectName || "",
      quantity: result.recordset[0].Quantity || 0,
      category: result.recordset[0].Category || "",
      subCategory: result.recordset[0].SubCategory || "",
      deviceCount: devices.reduce((sum, d) => sum + (d.quantity || 1), 0),
      signedReportPhoto: signedPhotoValue,
      status: result.recordset[0][DB_FIELDS.STATUS] || result.recordset[0].Status || "Created",
      senderAddress: result.recordset[0][DB_FIELDS.SENDER_ADDRESS] || result.recordset[0].SenderAddress || "",
      trackingNumber: result.recordset[0][DB_FIELDS.TRACKING_NUMBER_IN] || result.recordset[0].TrackingNumber_In || "",
      expressCompany: result.recordset[0][DB_FIELDS.COURIER_COMPANY] || result.recordset[0].CourierCompany || "",
      revisionRequestedBy: hasRevisionRequestedBy ? (result.recordset[0].RevisionRequestedBy || null) : null,
      revisionRequestReason: hasRevisionRequestReason ? (result.recordset[0].RevisionRequestReason || null) : null,
      revisionRequestDate: hasRevisionRequestDate ? (result.recordset[0].RevisionRequestDate || null) : null,
      factoryTrackingNum: hasFactoryTrackingNum ? (result.recordset[0].FactoryTrackingNum || null) : null,
      factoryShipDate: hasFactoryShipDate ? (result.recordset[0].FactoryShipDate || null) : null,
    }

    console.log(`✅ 查询到 ${devices.length} 个设备`)

    return NextResponse.json({
      success: true,
      data: {
        batchInfo,
        devices,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败"
    console.error("查询批次设备列表失败:", error)
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    )
  }
}

// POST /api/tickets/batch-devices/[batchId]
// 向批次中添加新设备
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params)

    const batchId = resolvedParams.batchId
    const body = await request.json()
    const { devices } = body

    if (!batchId || !devices || !Array.isArray(devices) || devices.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次ID和设备列表不能为空" },
        { status: 400 }
      )
    }

    // 获取当前用户
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value
    const userRoleCookie = cookieStore.get("userRole")?.value

    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    // 权限检查：只有现场人员和管理员可以添加设备
    if (userRoleCookie !== UserRole.REPORTER && userRoleCookie !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: "无权限添加设备，仅现场人员和管理员可操作" },
        { status: 403 }
      )
    }

    const pool = await getDbConnection()

    // 验证批次存在且获取批次状态
    const batchResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1 ${DB_FIELDS.STATUS}, ${DB_FIELDS.PROJECT_NAME}, ${DB_FIELDS.CONTACT_INFO}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (batchResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次不存在" },
        { status: 404 }
      )
    }

    const batchStatus = batchResult.recordset[0][DB_FIELDS.STATUS] || batchResult.recordset[0].Status
    const projectName = batchResult.recordset[0][DB_FIELDS.PROJECT_NAME] || batchResult.recordset[0].ProjectName
    const contactInfo = batchResult.recordset[0][DB_FIELDS.CONTACT_INFO] || batchResult.recordset[0].ContactInfo

    // 动态检测列是否存在，避免向不存在的列写入
    const colCheckResult = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const existingCols: string[] = colCheckResult.recordset.map((r: Record<string, unknown>) => (r.COLUMN_NAME as string).toLowerCase())
    const hasReportTime     = existingCols.includes("reporttime")
    const hasReportByUserId = existingCols.includes("reportbyuserid")
    const hasSubCategoryCol = existingCols.includes("subcategory")
    const hasFaultDesc      = existingCols.includes("faultdescription")
    const hasCategoryCol    = existingCols.includes("category")
    const hasMaterialCode   = existingCols.includes("materialcode")
    const hasQuantityCol    = existingCols.includes("quantity")
    const hasProjectName    = existingCols.includes("projectname")
    const hasContactInfo    = existingCols.includes("contactinfo")

    // 批量插入设备
    const createdDeviceIds: string[] = []
    const errors: Array<{ deviceSn: string; error: string }> = []

    for (const device of devices) {
      if (!device.deviceSn || !device.modelName) {
        errors.push({
          deviceSn: device.deviceSn || "未知",
          error: "设备序列号和型号为必填项"
        })
        continue
      }

      try {
        const insertRequest = pool.request()
        insertRequest.input("deviceSn", device.deviceSn)
        insertRequest.input("batchId", batchId)
        insertRequest.input("status", batchStatus)
        insertRequest.input("modelName", device.modelName)
        insertRequest.input("deviceName", device.deviceName || null)
        insertRequest.input("problem", device.faultDescription || "")

        // 动态组装 INSERT 列和值
        let insertCols = `${DB_FIELDS.DEVICE_SN}, ${DB_FIELDS.BATCH_ID}, ${DB_FIELDS.STATUS}, ${DB_FIELDS.MODEL_NAME}, ${DB_FIELDS.DEVICE_NAME}, ${DB_FIELDS.PROBLEM}`
        let insertVals = `@deviceSn, @batchId, @status, @modelName, @deviceName, @problem`

        if (hasFaultDesc) {
          insertCols += `, ${DB_FIELDS.FAULT_DESCRIPTION}`
          insertVals += `, @faultDescription`
          insertRequest.input("faultDescription", device.faultDescription || "")
        }
        if (hasCategoryCol) {
          insertCols += `, ${DB_FIELDS.CATEGORY}`
          insertVals += `, @category`
          insertRequest.input("category", device.category || null)
        }
        if (hasSubCategoryCol) {
          insertCols += `, ${DB_FIELDS.SUB_CATEGORY}`
          insertVals += `, @subCategory`
          insertRequest.input("subCategory", device.subCategory || null)
        }
        if (hasMaterialCode) {
          insertCols += `, ${DB_FIELDS.MATERIAL_CODE}`
          insertVals += `, @materialCode`
          insertRequest.input("materialCode", device.materialCode || null)
        }
        if (hasQuantityCol) {
          insertCols += `, ${DB_FIELDS.QUANTITY}`
          insertVals += `, @quantity`
          insertRequest.input("quantity", device.quantity || 1)
        }
        if (hasProjectName) {
          insertCols += `, ${DB_FIELDS.PROJECT_NAME}`
          insertVals += `, @projectName`
          insertRequest.input("projectName", projectName)
        }
        if (hasContactInfo) {
          insertCols += `, ${DB_FIELDS.CONTACT_INFO}`
          insertVals += `, @contactInfo`
          insertRequest.input("contactInfo", contactInfo)
        }
        if (hasReportByUserId) {
          insertCols += `, ${DB_FIELDS.REPORT_BY_USER_ID}`
          insertVals += `, @reportByUserID`
          insertRequest.input("reportByUserID", Number(userIdCookie))
        }
        if (hasReportTime) {
          insertCols += `, ${DB_FIELDS.REPORT_TIME}`
          insertVals += `, @reportTime`
          insertRequest.input("reportTime", new Date())
        }

        await insertRequest.query(`
          INSERT INTO Repair_Tickets (${insertCols})
          VALUES (${insertVals})
        `)

        // 获取刚插入的设备ID
        const idResult = await pool
          .request()
          .input("deviceSn", device.deviceSn)
          .input("batchId", batchId)
          .query(`
            SELECT TOP 1 ${DB_FIELDS.ID}
            FROM Repair_Tickets
            WHERE ${DB_FIELDS.DEVICE_SN} = @deviceSn AND ${DB_FIELDS.BATCH_ID} = @batchId
            ORDER BY ${DB_FIELDS.ID} DESC
          `)

        if (idResult.recordset.length > 0) {
          createdDeviceIds.push(idResult.recordset[0][DB_FIELDS.ID]?.toString() || "")
        }
      } catch (insertError: unknown) {
        const insertErrMsg = insertError instanceof Error ? insertError.message : "插入失败"
        console.error(`插入设备失败 ${device.deviceSn}:`, insertError)
        errors.push({
          deviceSn: device.deviceSn,
          error: insertErrMsg
        })
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `部分设备添加失败：${errors.length}/${devices.length}`,
          errors,
          createdCount: createdDeviceIds.length
        },
        { status: 207 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `成功添加 ${createdDeviceIds.length} 台设备`,
      data: {
        createdDeviceIds,
        count: createdDeviceIds.length
      }
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "添加设备失败"
    console.error("添加设备失败:", error)
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    )
  }
}

// PUT /api/tickets/batch-devices/[batchId]
// 编辑批次中的设备信息
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params)

    const batchId = resolvedParams.batchId
    const body = await request.json()
    const { deviceId, updates } = body

    if (!batchId || !deviceId || !updates) {
      return NextResponse.json(
        { success: false, message: "批次ID、设备ID和更新数据不能为空" },
        { status: 400 }
      )
    }

    // 获取当前用户并检查权限
    const cookieStore = await cookies()
    const userRoleCookie = cookieStore.get("userRole")?.value

    // 权限检查：只有现场人员和管理员可以编辑设备
    if (userRoleCookie !== UserRole.REPORTER && userRoleCookie !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: "无权限编辑设备，仅现场人员和管理员可操作" },
        { status: 403 }
      )
    }

    const pool = await getDbConnection()

    // 验证设备属于该批次
    const verifyResult = await pool
      .request()
      .input("deviceId", deviceId)
      .input("batchId", batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.ID} = @deviceId AND ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (verifyResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "设备不存在或不属于该批次" },
        { status: 404 }
      )
    }

    // 构建更新语句
    const updateFields: string[] = []
    const updateRequest = pool.request()
    updateRequest.input("deviceId", deviceId)

    if (updates.deviceSn !== undefined) {
      updateFields.push(`${DB_FIELDS.DEVICE_SN} = @deviceSn`)
      updateRequest.input("deviceSn", updates.deviceSn)
    }
    if (updates.modelName !== undefined) {
      updateFields.push(`${DB_FIELDS.MODEL_NAME} = @modelName`)
      updateRequest.input("modelName", updates.modelName)
    }
    if (updates.deviceName !== undefined) {
      updateFields.push(`${DB_FIELDS.DEVICE_NAME} = @deviceName`)
      updateRequest.input("deviceName", updates.deviceName)
    }
    if (updates.faultDescription !== undefined) {
      updateFields.push(`${DB_FIELDS.PROBLEM} = @problem`)
      updateFields.push(`${DB_FIELDS.FAULT_DESCRIPTION} = @faultDescription`)
      updateRequest.input("problem", updates.faultDescription)
      updateRequest.input("faultDescription", updates.faultDescription)
    }
    if (updates.category !== undefined) {
      updateFields.push(`${DB_FIELDS.CATEGORY} = @category`)
      updateRequest.input("category", updates.category)
    }
    if (updates.subCategory !== undefined) {
      updateFields.push(`${DB_FIELDS.SUB_CATEGORY} = @subCategory`)
      updateRequest.input("subCategory", updates.subCategory)
    }
    if (updates.materialCode !== undefined) {
      updateFields.push(`${DB_FIELDS.MATERIAL_CODE} = @materialCode`)
      updateRequest.input("materialCode", updates.materialCode)
    }
    if (updates.quantity !== undefined) {
      updateFields.push(`${DB_FIELDS.QUANTITY} = @quantity`)
      updateRequest.input("quantity", updates.quantity)
    }
    if (updates.manufactureDate !== undefined) {
      updateFields.push(`ManufactureDate = @manufactureDate`)
      updateRequest.input("manufactureDate", updates.manufactureDate ? new Date(updates.manufactureDate) : null)
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { success: false, message: "没有需要更新的字段" },
        { status: 400 }
      )
    }

    await updateRequest.query(`
      UPDATE Repair_Tickets
      SET ${updateFields.join(", ")}
      WHERE ${DB_FIELDS.ID} = @deviceId
    `)

    return NextResponse.json({
      success: true,
      message: "设备信息已更新"
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "更新设备失败"
    console.error("更新设备失败:", error)
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    )
  }
}

// DELETE /api/tickets/batch-devices/[batchId]
// 删除批次中的设备
export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params)

    const batchId = resolvedParams.batchId
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    if (!batchId || !deviceId) {
      return NextResponse.json(
        { success: false, message: "批次ID和设备ID不能为空" },
        { status: 400 }
      )
    }

    // 获取当前用户并检查权限
    const cookieStore = await cookies()
    const userRoleCookie = cookieStore.get("userRole")?.value

    // 权限检查：只有现场人员和管理员可以删除设备
    if (userRoleCookie !== UserRole.REPORTER && userRoleCookie !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: "无权限删除设备，仅现场人员和管理员可操作" },
        { status: 403 }
      )
    }

    const pool = await getDbConnection()

    // 验证设备属于该批次
    const verifyResult = await pool
      .request()
      .input("deviceId", deviceId)
      .input("batchId", batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.ID} = @deviceId AND ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (verifyResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "设备不存在或不属于该批次" },
        { status: 404 }
      )
    }

    // 检查批次是否还有其他设备
    const countResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT COUNT(*) as DeviceCount
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    const deviceCount = countResult.recordset[0].DeviceCount

    if (deviceCount <= 1) {
      return NextResponse.json(
        { success: false, message: "批次至少需要包含一台设备，无法删除" },
        { status: 400 }
      )
    }

    // 软删除：标记为已删除
    await pool
      .request()
      .input("deviceId", deviceId)
      .input("deletedStatus", TicketStatus.DELETED)
      .query(`
        UPDATE Repair_Tickets
        SET ${DB_FIELDS.STATUS} = @deletedStatus,
            DeletedAt = GETUTCDATE()
        WHERE ${DB_FIELDS.ID} = @deviceId
      `)

    return NextResponse.json({
      success: true,
      message: "设备已删除"
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "删除设备失败"
    console.error("删除设备失败:", error)
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    )
  }
}
