import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import * as XLSX from "xlsx"

// GET /api/tickets/export
// 导出所有工单数据为Excel文件
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status") // 可选：按状态过滤
    
    const pool = await getDbConnection()

    // 获取所有列名
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
      ORDER BY ORDINAL_POSITION
    `)
    const columnNames = columnsResult.recordset.map(row => row.COLUMN_NAME as string)

    // 构建查询SQL - 查询所有字段
    const selectColumns = columnNames.map(col => `[${col}]`).join(', ')
    
    let query = `
      SELECT ${selectColumns}
      FROM Repair_Tickets
    `
    
    // 如果指定了状态过滤
    if (statusFilter) {
      query += ` WHERE Status = @status`
    }
    
    query += ` ORDER BY ReportTime DESC, SubmitDate DESC`

    const requestObj = pool.request()
    if (statusFilter) {
      requestObj.input("status", statusFilter)
    }
    
    const result = await requestObj.query(query)

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "没有数据可导出" },
        { status: 404 }
      )
    }

    // 字段映射：数据库字段名 -> Excel列名（中文）
    const fieldMapping: Record<string, string> = {
      // 基础信息
      Id: "工单ID",
      Status: "状态",
      ReportTime: "报修时间",
      
      // 现场人员填报区
      SubmitDate: "提交日期",
      TrackingNumber_In: "发出快递单号",
      SenderAddress: "寄件人地址",
      ContactInfo: "联系人及电话",
      ProjectName: "项目/客户名称",
      Category: "产品名称",
      ModelName: "型号",
      Quantity: "数量",
      ProductSN: "产品序列号",
      FaultDescription: "故障描述",
      DeviceImages: "设备照片",
      DamageImages: "故障照片",
      
      // 维修人员填写区
      MaterialCode: "物料代码",
      DeviceName: "物料名称",
      FullSpec: "规格型号",
      FaultPoint: "故障点",
      RepairCost: "收费金额",
      IsOutsourced: "是否需返厂",
      
      // 管理员填写区
      FactoryRepairDate: "返厂维修日期",
      FactoryTrackingNum: "返厂维修快递单号",
      SupplierName: "供应商名称",
      IsChargeable: "是否收费",
      ClientName: "客户名称",
      IsInvoiced: "是否开票",
      FactoryReceivedDate: "收到原厂寄回日期",
      
      // 仓库管理员填写区
      ReceivedDate: "收到日期",
      FactoryShipDate: "出厂日期",
      ReturnDate: "返还客户日期",
      ReturnQuantity: "返还客户数量",
      ReturnTrackingNum: "返还客户快递单号",
    }

    // 转换数据格式
    const excelData = result.recordset.map((row: any) => {
      const excelRow: Record<string, any> = {}
      
      // 遍历所有列
      columnNames.forEach((colName) => {
        const value = row[colName]
        const excelColName = fieldMapping[colName] || colName
        
        // 处理不同类型的值
        if (value === null || value === undefined) {
          excelRow[excelColName] = ""
        } else if (value instanceof Date) {
          // 日期格式化为 yyyy-MM-dd HH:mm:ss
          excelRow[excelColName] = new Date(value).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).replace(/\//g, "-")
        } else if (typeof value === "boolean" || (typeof value === "number" && (value === 0 || value === 1))) {
          // 布尔值转换为是/否
          excelRow[excelColName] = value ? "是" : "否"
        } else if (typeof value === "number") {
          excelRow[excelColName] = value
        } else {
          excelRow[excelColName] = String(value)
        }
      })
      
      return excelRow
    })

    // 定义列的顺序（严格按照用户要求的顺序）
    const columnOrder = [
      // 基础信息
      "工单ID",
      "状态",
      "报修时间",
      
      // 现场人员填报区（按用户要求顺序）
      "提交日期",
      "发出快递单号",
      "寄件人地址",
      "联系人及电话",
      "项目/客户名称",
      "产品名称",
      "型号",
      "数量",
      "产品序列号",
      "故障描述",
      "设备照片",
      "故障照片",
      
      // 维修人员填写区（按用户要求顺序）
      "物料代码",
      "物料名称",
      "规格型号",
      "故障点",
      "收费金额",
      "是否需返厂",
      
      // 管理员填写区（按用户要求顺序）
      "返厂维修日期",
      "返厂维修快递单号",
      "供应商名称",
      "是否收费",
      "客户名称",
      "是否开票",
      "收到原厂寄回日期",
      
      // 仓库管理员填写区（按用户要求顺序）
      "出厂日期",
      "返还客户日期",
      "返还客户数量",
      "返还客户快递单号",
    ]

    // 创建Excel工作簿
    const workbook = XLSX.utils.book_new()
    
    // 过滤出实际存在的列
    const existingColumns = columnOrder.filter(col => 
      excelData.length > 0 && Object.keys(excelData[0]).includes(col)
    )
    
    // 重新排列数据，确保列顺序正确
    const orderedData = excelData.map(row => {
      const orderedRow: Record<string, any> = {}
      existingColumns.forEach(col => {
        orderedRow[col] = row[col] || ""
      })
      return orderedRow
    })
    
    // 创建带分组标题的数据
    // 第一行：分组标题
    const headerRow: Record<string, any> = {}
    existingColumns.forEach(col => {
      // 根据列名判断分组
      if (["工单ID", "状态", "报修时间"].includes(col)) {
        headerRow[col] = "基础信息"
      } else if (["提交日期", "发出快递单号", "寄件人地址", "联系人及电话", "项目/客户名称", "产品名称", "型号", "数量", "产品序列号", "故障描述", "设备照片", "故障照片"].includes(col)) {
        headerRow[col] = "现场人员填报区"
      } else if (["物料代码", "物料名称", "规格型号", "故障点", "收费金额", "是否需返厂"].includes(col)) {
        headerRow[col] = "维修人员填写区"
      } else if (["返厂维修日期", "返厂维修快递单号", "供应商名称", "是否收费", "客户名称", "是否开票", "收到原厂寄回日期"].includes(col)) {
        headerRow[col] = "管理员填写区"
      } else if (["出厂日期", "返还客户日期", "返还客户数量", "返还客户快递单号"].includes(col)) {
        headerRow[col] = "仓库管理员填写区"
      } else {
        headerRow[col] = ""
      }
    })
    
    // 第二行：列标题
    const titleRow: Record<string, any> = {}
    existingColumns.forEach(col => {
      titleRow[col] = col
    })
    
    // 合并数据：分组标题行 + 列标题行 + 数据行
    const allData = [headerRow, titleRow, ...orderedData]
    
    // 创建数据工作表
    const worksheet = XLSX.utils.json_to_sheet(allData, {
      header: existingColumns,
      skipHeader: false,
    })

    // 设置列宽
    const colWidths = existingColumns.map(col => {
      // 根据列名估算宽度
      if (col.includes("日期") || col.includes("时间")) return { wch: 20 }
      if (col.includes("地址") || col.includes("描述") || col.includes("故障点")) return { wch: 30 }
      if (col.includes("照片")) return { wch: 15 }
      if (col.includes("序列号") || col.includes("单号")) return { wch: 20 }
      if (col.includes("名称") || col.includes("型号")) return { wch: 25 }
      return { wch: 15 }
    })
    worksheet["!cols"] = colWidths
    
    // 合并分组标题行的单元格（可选，让表格更美观）
    // 注意：XLSX库的合并单元格功能有限，这里我们保持简单格式

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, "维修工单总表")

    // 生成Excel文件缓冲区
    const excelBuffer = XLSX.write(workbook, { 
      type: "buffer", 
      bookType: "xlsx",
      cellStyles: true,
    })

    // 生成文件名（使用URL编码避免中文编码问题）
    const dateStr = new Date().toISOString().split("T")[0]
    // 使用英文文件名作为fallback，中文文件名使用UTF-8编码
    const safeFilename = `repair_tickets_${dateStr}.xlsx`
    const chineseFilename = `维修工单总表_${dateStr}.xlsx`
    const encodedChineseFilename = encodeURIComponent(chineseFilename)
    
    // 返回Excel文件
    // 使用RFC 5987格式支持UTF-8编码的文件名
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedChineseFilename}`,
      },
    })
  } catch (error: any) {
    console.error("导出Excel失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "导出Excel失败",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}
