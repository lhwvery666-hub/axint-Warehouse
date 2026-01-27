import { NextResponse } from "next/server";
import { getDbConnection } from "@/lib/db-config";   // ✅ 从这里拿连接池
import { UPLOAD_DIR } from "@/app/api/config";       // ✅ 这里只导出 UPLOAD_DIR
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
// POST /api/tickets/create
// 现场人员提交报修：创建新的维修工单
export async function POST(request: Request) {
  try {
    const formData = await request.formData()

    // --- 1. 提取基础字段 ---
    const deviceSn = (formData.get("deviceSn") || "").toString().trim()
    const faultDesc = (formData.get("faultDesc") || "").toString().trim()
    const courierInfo = (formData.get("courierInfo") || "").toString().trim() || null
    const courierCompany = (formData.get("courierCompany") || "").toString().trim() || null
    const userIdRaw = (formData.get("userId") || "").toString().trim()
    const projectLocation = (formData.get("projectLocation") || "").toString().trim()
    const materialCode = (formData.get("materialCode") || "").toString().trim() || null

    // --- 2. 提取现场人员填报区字段 ---
    const submitDate = formData.get("submitDate") ? new Date(formData.get("submitDate") as string) : new Date()
    const trackingNumberIn = (formData.get("trackingNumberIn") || "").toString().trim() || null
    const senderAddress = (formData.get("senderAddress") || "").toString().trim() || null
    const contactInfo = (formData.get("contactInfo") || "").toString().trim() || null
    const projectName = (formData.get("projectName") || "").toString().trim() || null
    const category = (formData.get("category") || "").toString().trim() || null
    const selectedModelName = (formData.get("modelName") || "").toString().trim() || null
    const quantityRaw = (formData.get("quantity") || "1").toString().trim()
    const quantity = quantityRaw && !Number.isNaN(Number(quantityRaw)) ? Number(quantityRaw) : 1
    const rawProductSn = (formData.get("productSn") || "").toString().trim() || deviceSn

    // --- 3. 提取产品信息类 (三级联动) ---
    const subCategory = (formData.get("subCategory") || "").toString().trim() || null
    const fullSpec = (formData.get("fullSpec") || "").toString().trim() || null

    // --- 4. 关键逻辑：“标签磨损/无法辨识”模式 ---
    // 如果前端传来了 "PENDING_VERIFY"，说明用户勾选了那个框
    const isPendingVerify =
      rawProductSn === "PENDING_VERIFY" || deviceSn === "PENDING_VERIFY"
    
    // 最终存入数据库的 SN：如果是待定模式，存 "PENDING"，否则存真实的 SN
    const productSn = isPendingVerify ? "PENDING" : (rawProductSn || deviceSn)

    // --- 5. 提取维修信息类 ---
    const faultPoint = (formData.get("faultPoint") || "").toString().trim() || null
    const isChargeableRaw = (formData.get("isChargeable") || "")
      .toString()
      .trim()
      .toLowerCase()
    const isChargeable =
      isChargeableRaw === "true" || isChargeableRaw === "1"
        ? 1
        : isChargeableRaw === "false" || isChargeableRaw === "0" || !isChargeableRaw
        ? 0
        : null
    const repairCostRaw = (formData.get("repairCost") || "").toString().trim()
    const repairCost =
      repairCostRaw && !Number.isNaN(Number(repairCostRaw)) ? Number(repairCostRaw) : null

    // --- 6. 提取图片文件 ---
    const deviceImageFiles = formData.getAll("deviceImages")
    const damageImageFiles = formData.getAll("damageImages")

    // --- 校验逻辑 ---
    // 只有在“非待定”模式下，才强制要求 SN 必填
    if ((!deviceSn && !isPendingVerify) || !faultDesc) {
      return NextResponse.json(
        { success: false, message: "设备序列号和故障描述为必填项" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 工具函数：确保目录存在
    const ensureDirExists = async (dir: string) => {
      await fs.promises.mkdir(dir, { recursive: true })
    }

    // 工具函数：保存文件 (修复了 Windows 路径反斜杠问题)
    const saveUploadedFiles = async (files: any[]): Promise<string[]> => {
      if (!files || files.length === 0) return []

      const today = new Date()
      const folderName = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
      const targetDir = path.join(UPLOAD_DIR, folderName)
      await ensureDirExists(targetDir)

      const savedRelativePaths: string[] = []

      for (const file of files) {
        if (!file || typeof (file as any).arrayBuffer !== "function") continue
        const f = file as any
        const originalName: string = (f.name || "").toString()
        const mimeType: string = (f.type || "").toString()

        let extension = path.extname(originalName) || ""
        if (!extension) {
            if (mimeType === "image/png") extension = ".png"
            else if (mimeType === "image/jpeg" || mimeType === "image/jpg") extension = ".jpg"
            else extension = ".jpg"
        }

        const fileName = `${crypto.randomUUID()}${extension}`
        const filePath = path.join(targetDir, fileName)
        const arrayBuffer = await f.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        await fs.promises.writeFile(filePath, buffer)

        // 强制使用正斜杠，兼容 Web 显示
        const relativePath = path.posix.join(folderName, fileName).replace(/\\/g, "/")
        savedRelativePaths.push(relativePath)
      }
      return savedRelativePaths
    }

    // 获取数据库列结构，用于动态生成 INSERT
    const columnCheck = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const availableColumns = columnCheck.recordset.map((row: any) => row.COLUMN_NAME)
    
    // 检查列是否存在 - 现场人员填报区
    const hasSubmitDate = availableColumns.some((col: string) => col.toLowerCase() === "submitdate")
    const hasTrackingNumberIn = availableColumns.some((col: string) => col.toLowerCase() === "trackingnumber_in")
    const hasSenderAddress = availableColumns.some((col: string) => col.toLowerCase() === "senderaddress")
    const hasContactInfo = availableColumns.some((col: string) => col.toLowerCase() === "contactinfo")
    const hasProjectName = availableColumns.some((col: string) => col.toLowerCase() === "projectname")
    const hasCategory = availableColumns.some((col: string) => col.toLowerCase() === "category")
    const hasQuantity = availableColumns.some((col: string) => col.toLowerCase() === "quantity")
    const hasProductSn = availableColumns.some((col: string) => col.toLowerCase() === "productsn")
    const hasFaultDescription = availableColumns.some((col: string) => col.toLowerCase() === "faultdescription")
    
    // 维修人员填写区
    const hasMaterialCode = availableColumns.some((col: string) => col.toLowerCase() === "materialcode")
    const hasDeviceName = availableColumns.some((col: string) => col.toLowerCase() === "devicename")
    const hasFullSpec = availableColumns.some((col: string) => col.toLowerCase() === "fullspec")
    const hasFaultPoint = availableColumns.some((col: string) => col.toLowerCase() === "faultpoint")
    const hasIsChargeable = availableColumns.some((col: string) => col.toLowerCase() === "ischargeable")
    const hasIsOutsourced = availableColumns.some((col: string) => col.toLowerCase() === "isoutsourced")
    
    // 管理员填写区
    const hasFactoryRepairDate = availableColumns.some((col: string) => col.toLowerCase() === "factoryrepairdate")
    const hasFactoryTrackingNum = availableColumns.some((col: string) => col.toLowerCase() === "factorytrackingnum")
    const hasSupplierName = availableColumns.some((col: string) => col.toLowerCase() === "suppliername")
    const hasRepairCost = availableColumns.some((col: string) => col.toLowerCase() === "repaircost")
    const hasClientName = availableColumns.some((col: string) => col.toLowerCase() === "clientname")
    const hasIsInvoiced = availableColumns.some((col: string) => col.toLowerCase() === "isinvoiced")
    const hasFactoryReceivedDate = availableColumns.some((col: string) => col.toLowerCase() === "factoryreceiveddate")
    
    // 仓库管理员填写区
    const hasReceivedDate = availableColumns.some((col: string) => col.toLowerCase() === "receiveddate")
    const hasFactoryShipDate = availableColumns.some((col: string) => col.toLowerCase() === "factoryshipdate")
    const hasReturnDate = availableColumns.some((col: string) => col.toLowerCase() === "returndate")
    const hasReturnQuantity = availableColumns.some((col: string) => col.toLowerCase() === "returnquantity")
    const hasReturnTrackingNum = availableColumns.some((col: string) => col.toLowerCase() === "returntrackingnum")
    
    // 其他字段
    const hasDeviceImages = availableColumns.some((col: string) => col.toLowerCase() === "deviceimages")
    const hasDamageImages = availableColumns.some((col: string) => col.toLowerCase() === "damageimages")
    const hasWarehouse = availableColumns.some((col: string) => col.toLowerCase() === "warehouse")
    
    // 兼容旧字段
    const hasContactName = availableColumns.some((col: string) => col.toLowerCase() === "contactname")
    const hasContactPhone = availableColumns.some((col: string) => col.toLowerCase() === "contactphone")
    const hasSubCategory = availableColumns.some((col: string) => col.toLowerCase() === "subcategory")
    const hasDeviceType = availableColumns.some((col: string) => col.toLowerCase() === "devicetype")
    const hasProjectLocation = availableColumns.some((col: string) => col.toLowerCase() === "projectlocation")
    const hasCourierCompany = availableColumns.some((col: string) => col.toLowerCase() === "couriercompany")
    const hasCourierNumber = availableColumns.some((col: string) => col.toLowerCase() === "couriernumber")
    const hasReportTime = availableColumns.some((col: string) => col.toLowerCase() === "reporttime" || col.toLowerCase() === "reporttime")
    const hasReportByUserID = availableColumns.some((col: string) => col.toLowerCase() === "reportbyuserid" || col.toLowerCase() === "reportbyuserid")

    const reportTime = new Date().toISOString().slice(0, 19).replace("T", " ")

    // ==========================================
    // 分支 1：暂缓验证流程 (PENDING)
    // ==========================================
    if (isPendingVerify) {
      const requestPending = pool.request()
        .input("deviceSn", "PENDING")
        .input("modelName", selectedModelName)
        .input("faultDesc", faultDesc)
        .input("status", "Created") // 状态设为 Created (待维修)

      // 动态构建 PENDING 流程的 SQL
      let insertPending = `INSERT INTO Repair_Tickets (DeviceSN, ModelName, FaultDescription, Status`
      let valuesPending = `VALUES (@deviceSn, @modelName, @faultDesc, @status`
      
      // 添加可选字段
      if (hasProjectLocation) {
        insertPending += `, ProjectLocation`
        valuesPending += `, @projectLocation`
        requestPending.input("projectLocation", projectLocation || null)
      }
      if (hasReportByUserID) {
        insertPending += `, ReportByUserID`
        valuesPending += `, @reportByUserID`
        requestPending.input("reportByUserID", userIdRaw ? Number(userIdRaw) || null : null)
      }
      if (hasCourierCompany) {
        insertPending += `, CourierCompany`
        valuesPending += `, @courierCompany`
        requestPending.input("courierCompany", courierCompany || null)
      }
      if (hasCourierNumber) {
        insertPending += `, CourierNumber`
        valuesPending += `, @courierNumber`
        requestPending.input("courierNumber", courierInfo || null)
      }
      if (hasReportTime) {
        insertPending += `, ReportTime`
        valuesPending += `, @reportTime`
        requestPending.input("reportTime", reportTime)
      }

      // 动态拼接待定字段 - 现场人员填报区
      if (hasSubmitDate) { insertPending += `, SubmitDate`; valuesPending += `, @submitDate`; requestPending.input("submitDate", submitDate) }
      if (hasTrackingNumberIn) { insertPending += `, TrackingNumber_In`; valuesPending += `, @trackingNumberIn`; requestPending.input("trackingNumberIn", trackingNumberIn) }
      if (hasSenderAddress) { insertPending += `, SenderAddress`; valuesPending += `, @senderAddress`; requestPending.input("senderAddress", senderAddress) }
      if (hasContactInfo) { insertPending += `, ContactInfo`; valuesPending += `, @contactInfo`; requestPending.input("contactInfo", contactInfo) }
      if (hasProjectName) { insertPending += `, ProjectName`; valuesPending += `, @projectName`; requestPending.input("projectName", projectName) }
      if (hasCategory) { insertPending += `, Category`; valuesPending += `, @category`; requestPending.input("category", category) }
      if (hasQuantity) { insertPending += `, Quantity`; valuesPending += `, @quantity`; requestPending.input("quantity", quantity) }
      if (hasProductSn) { insertPending += `, ProductSN`; valuesPending += `, @productSn`; requestPending.input("productSn", "PENDING") }
      // 注意：FaultDescription 已经在基础字段中，不需要重复添加
      
      // 兼容旧字段
      if (hasContactName && !hasContactInfo) { insertPending += `, ContactName`; valuesPending += `, @contactName`; requestPending.input("contactName", contactInfo) }
      if (hasContactPhone && !hasContactInfo) { insertPending += `, ContactPhone`; valuesPending += `, @contactPhone`; requestPending.input("contactPhone", contactInfo) }
      if (hasSubCategory) { insertPending += `, SubCategory`; valuesPending += `, @subCategory`; requestPending.input("subCategory", subCategory) }
      
      // 维修人员填写区（创建时可能为空）
      if (hasFullSpec) { insertPending += `, FullSpec`; valuesPending += `, @fullSpec`; requestPending.input("fullSpec", fullSpec) }
      if (hasFaultPoint) { insertPending += `, FaultPoint`; valuesPending += `, @faultPoint`; requestPending.input("faultPoint", faultPoint) }
      
      // 管理员填写区（创建时可能为空）
      if (hasIsChargeable) { insertPending += `, IsChargeable`; valuesPending += `, @isChargeable`; requestPending.input("isChargeable", isChargeable) }
      if (hasRepairCost) { insertPending += `, RepairCost`; valuesPending += `, @repairCost`; requestPending.input("repairCost", repairCost) }

      // 图片处理
      if (hasDeviceImages) {
        const savedDeviceImages = await saveUploadedFiles(deviceImageFiles)
        if (savedDeviceImages.length > 0) {
          insertPending += `, DeviceImages`; valuesPending += `, @deviceImages`
          requestPending.input("deviceImages", JSON.stringify(savedDeviceImages))
        }
      }
      if (hasDamageImages) {
        const savedDamageImages = await saveUploadedFiles(damageImageFiles)
        if (savedDamageImages.length > 0) {
          insertPending += `, DamageImages`; valuesPending += `, @damageImages`
          requestPending.input("damageImages", JSON.stringify(savedDamageImages))
        }
      }

      insertPending += `)`
      valuesPending += `)`
      await requestPending.query(insertPending + " " + valuesPending)

      return NextResponse.json({ success: true, message: "报修工单创建成功（待核验序列号）" }, { status: 201 })
    }

    // ==========================================
    // 分支 2：正常 SN 验证流程 (严格校验库存)
    // ==========================================
    
    // 1. 查库存
    const deviceResult = await pool.request()
      .input("serialNumber", deviceSn)
      .query(`SELECT TOP 1 * FROM Device_Inventory WHERE SerialNumber = @serialNumber`)

    if (deviceResult.recordset.length === 0) {
      return NextResponse.json({ success: false, message: "设备序列号不存在于设备档案中，请先录入设备信息" }, { status: 400 })
    }

    const device = deviceResult.recordset[0]
    
    // 2. 更新库存状态
    const currentStatus = device.Status || ""
    if (currentStatus === "在库" || currentStatus === "In Stock" || currentStatus.toLowerCase() === "instock" || currentStatus === "出库" || currentStatus === "Out Stock") {
       await pool.request().input("serialNumber", deviceSn).input("newStatus", "维修中")
        .query(`UPDATE Device_Inventory SET Status = @newStatus WHERE SerialNumber = @serialNumber`)
    }

    // 3. 准备数据
    const finalMaterialCode = materialCode || device.MaterialCode || null
    // 如果用户没选型号，就用库存里的；如果选了，以用户的为准
    const finalModelName = selectedModelName || device.ModelName || null 
    const finalWarehouse = device.Warehouse || null
    // 优先用用户填的项目地点，如果没填则用库存里的
    const projectLocationForDb = projectLocation || device.ProjectLocation || null

    // 4. 构建正常流程的 SQL
    const requestNormal = pool.request()
      .input("deviceSn", deviceSn)
      .input("modelName", finalModelName)
      .input("faultDesc", faultDesc)
      .input("status", "Created") // 状态设为 Created (待维修)

    // 动态构建基础字段
    let insertQuery = `INSERT INTO Repair_Tickets (DeviceSN, ModelName, FaultDescription, Status`
    let valuesQuery = `VALUES (@deviceSn, @modelName, @faultDesc, @status`
    
    // 添加可选的基础字段
    if (hasDeviceType) {
      insertQuery += `, DeviceType`
      valuesQuery += `, @deviceType`
      requestNormal.input("deviceType", device.DeviceType || null)
    }
    if (hasProjectLocation) {
      insertQuery += `, ProjectLocation`
      valuesQuery += `, @projectLocation`
      requestNormal.input("projectLocation", projectLocationForDb)
    }
    if (hasReportByUserID) {
      insertQuery += `, ReportByUserID`
      valuesQuery += `, @reportByUserID`
      requestNormal.input("reportByUserID", userIdRaw ? Number(userIdRaw) || null : null)
    }
    if (hasCourierCompany) {
      insertQuery += `, CourierCompany`
      valuesQuery += `, @courierCompany`
      requestNormal.input("courierCompany", courierCompany || null)
    }
    if (hasCourierNumber) {
      insertQuery += `, CourierNumber`
      valuesQuery += `, @courierNumber`
      requestNormal.input("courierNumber", courierInfo || null)
    }
    if (hasReportTime) {
      insertQuery += `, ReportTime`
      valuesQuery += `, @reportTime`
      requestNormal.input("reportTime", reportTime)
    }

    // 动态拼接正常流程字段
    if (hasMaterialCode) { insertQuery += `, MaterialCode`; valuesQuery += `, @materialCode`; requestNormal.input("materialCode", finalMaterialCode) }
    if (hasWarehouse) { insertQuery += `, Warehouse`; valuesQuery += `, @warehouse`; requestNormal.input("warehouse", finalWarehouse) }
    
    // 现场人员填报区字段
    if (hasSubmitDate) { insertQuery += `, SubmitDate`; valuesQuery += `, @submitDate`; requestNormal.input("submitDate", submitDate) }
    if (hasTrackingNumberIn) { insertQuery += `, TrackingNumber_In`; valuesQuery += `, @trackingNumberIn`; requestNormal.input("trackingNumberIn", trackingNumberIn) }
    if (hasSenderAddress) { insertQuery += `, SenderAddress`; valuesQuery += `, @senderAddress`; requestNormal.input("senderAddress", senderAddress) }
    if (hasContactInfo) { insertQuery += `, ContactInfo`; valuesQuery += `, @contactInfo`; requestNormal.input("contactInfo", contactInfo) }
    if (hasProjectName) { insertQuery += `, ProjectName`; valuesQuery += `, @projectName`; requestNormal.input("projectName", projectName) }
    if (hasCategory) { insertQuery += `, Category`; valuesQuery += `, @category`; requestNormal.input("category", category) }
    if (hasQuantity) { insertQuery += `, Quantity`; valuesQuery += `, @quantity`; requestNormal.input("quantity", quantity) }
    if (hasProductSn) { insertQuery += `, ProductSN`; valuesQuery += `, @productSn`; requestNormal.input("productSn", deviceSn) } // 正常流程存真实SN
    // 注意：FaultDescription 已经在基础字段中，不需要重复添加
    
    // 兼容旧字段
    if (hasContactName && !hasContactInfo) { insertQuery += `, ContactName`; valuesQuery += `, @contactName`; requestNormal.input("contactName", contactInfo) }
    if (hasContactPhone && !hasContactInfo) { insertQuery += `, ContactPhone`; valuesQuery += `, @contactPhone`; requestNormal.input("contactPhone", contactInfo) }
    if (hasSubCategory) { insertQuery += `, SubCategory`; valuesQuery += `, @subCategory`; requestNormal.input("subCategory", subCategory) }
    
    // 维修人员填写区（创建时可能为空，但可以预填）
    if (hasFullSpec) { insertQuery += `, FullSpec`; valuesQuery += `, @fullSpec`; requestNormal.input("fullSpec", fullSpec) }
    if (hasFaultPoint) { insertQuery += `, FaultPoint`; valuesQuery += `, @faultPoint`; requestNormal.input("faultPoint", faultPoint) }
    
    // 管理员填写区（创建时可能为空）
    if (hasIsChargeable) { insertQuery += `, IsChargeable`; valuesQuery += `, @isChargeable`; requestNormal.input("isChargeable", isChargeable) }
    if (hasRepairCost) { insertQuery += `, RepairCost`; valuesQuery += `, @repairCost`; requestNormal.input("repairCost", repairCost) }

    // 图片处理 (正常流程)
    if (hasDeviceImages) {
        const savedDeviceImages = await saveUploadedFiles(deviceImageFiles)
        if (savedDeviceImages.length > 0) {
            insertQuery += `, DeviceImages`; valuesQuery += `, @deviceImages`
            requestNormal.input("deviceImages", JSON.stringify(savedDeviceImages))
        }
    }
    if (hasDamageImages) {
        const savedDamageImages = await saveUploadedFiles(damageImageFiles)
        if (savedDamageImages.length > 0) {
            insertQuery += `, DamageImages`; valuesQuery += `, @damageImages`
            requestNormal.input("damageImages", JSON.stringify(savedDamageImages))
        }
    }

    insertQuery += `)`
    valuesQuery += `)`
    await requestNormal.query(insertQuery + " " + valuesQuery)

    return NextResponse.json({ success: true, message: "报修工单创建成功" }, { status: 201 })

  } catch (error: any) {
    console.error("创建报修工单失败:", error)
    return NextResponse.json(
      { success: false, message: "创建报修工单时发生错误", error: error?.message || "未知错误" },
      { status: 500 }
    )
  }
}