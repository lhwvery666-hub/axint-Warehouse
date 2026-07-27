import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
const bcrypt = require('bcryptjs')

// GET /api/users
// 获取所有用户列表（仅管理员可访问）
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const includeDeleted = url.searchParams.get("includeDeleted") === "true"

    const pool = await getDbConnection()

    // 检查是否有时间戳字段和软删除字段
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME IN ('CreatedAt', 'UpdatedAt', 'IsDeleted')
      `)
    
    const hasCreatedAt = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'CreatedAt')
    const hasUpdatedAt = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'UpdatedAt')
    const hasIsDeleted = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'IsDeleted')
    const orderBy = hasCreatedAt ? 'ORDER BY CreatedAt DESC' : 'ORDER BY UserID DESC'
    
    // 检查是否有 PhoneNumber 字段
    const phoneColumnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'PhoneNumber'
      `)
    const hasPhoneNumber = phoneColumnCheck.recordset.length > 0

    const whereClause = hasIsDeleted && !includeDeleted ? "WHERE IsDeleted = 0" : ""

    const result = await pool.request().query(`
      SELECT 
        UserID,
        Username,
        Role,
        RealName${hasPhoneNumber ? ', PhoneNumber' : ''}${hasCreatedAt ? ', CreatedAt' : ''}${hasUpdatedAt ? ', UpdatedAt' : ''}
      FROM Users
      ${whereClause}
      ${orderBy}
    `)

    const users = result.recordset.map((row: any) => ({
      id: row.UserID?.toString() || "",
      username: row.Username || "",
      role: row.Role || "",
      realName: row.RealName || "",
      phoneNumber: hasPhoneNumber ? (row.PhoneNumber || "") : "",
      createdAt: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : null,
      updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
    }))

    return NextResponse.json({
      success: true,
      data: users,
    })
  } catch (error: any) {
    console.error("获取用户列表失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取用户列表时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

// POST /api/users
// 创建新用户（仅管理员可访问）
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password, realName, role, phoneNumber } = body ?? {}

    if (!username || !password || !realName) {
      return NextResponse.json(
        { success: false, message: "用户名、密码和姓名为必填项" },
        { status: 400 }
      )
    }

    // 如果提供了手机号，验证格式
    if (phoneNumber) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(phoneNumber)) {
        return NextResponse.json(
          { success: false, message: "手机号格式不正确，请输入11位有效手机号" },
          { status: 400 }
        )
      }
    }

    // 验证角色 —— 使用大小写不敏感匹配，兼容 PascalCase 与 lowercase 两种写法
    const validRoles = ["Admin", "Technician", "Warehouse", "Reporter", "Business", "User"]
    if (role && !validRoles.some(r => r.toLowerCase() === role.toLowerCase())) {
      return NextResponse.json(
        { success: false, message: `角色必须是以下之一: ${validRoles.join(", ")}` },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 检查用户名是否已存在
    const existsResult = await pool
      .request()
      .input("username", username)
      .query(`SELECT 1 FROM Users WHERE Username = @username`)

    if (existsResult.recordset.length > 0) {
      return NextResponse.json(
        { success: false, message: "用户名已存在，请使用其他用户名" },
        { status: 400 }
      )
    }

    // 如果提供了手机号，检查手机号是否已存在
    if (phoneNumber) {
      const phoneExistsResult = await pool
        .request()
        .input("phoneNumber", phoneNumber)
        .query(`SELECT 1 FROM Users WHERE PhoneNumber = @phoneNumber`)

      if (phoneExistsResult.recordset.length > 0) {
        return NextResponse.json(
          { success: false, message: "该手机号已被注册，请使用其他手机号" },
          { status: 400 }
        )
      }
    }

    // 加密密码
    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // 检查表结构
    const hasTimestampFields = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME IN ('CreatedAt', 'UpdatedAt', 'PhoneNumber')
      `)
    
    const hasCreatedAt = hasTimestampFields.recordset.some((r: any) => r.COLUMN_NAME === 'CreatedAt')
    const hasUpdatedAt = hasTimestampFields.recordset.some((r: any) => r.COLUMN_NAME === 'UpdatedAt')
    const hasPhoneNumber = hasTimestampFields.recordset.some((r: any) => r.COLUMN_NAME === 'PhoneNumber')
    
    // 构建插入语句
    const requestBuilder = pool.request()
      .input("username", username)
      .input("password", hashedPassword)
      .input("realName", realName)
      .input("role", role || null)
    
    let insertColumns = "Username, Password, RealName, Role"
    let insertValues = "@username, @password, @realName, @role"
    
    if (hasPhoneNumber && phoneNumber) {
      insertColumns += ", PhoneNumber"
      insertValues += ", @phoneNumber"
      requestBuilder.input("phoneNumber", phoneNumber)
    }
    
    if (hasCreatedAt && hasUpdatedAt) {
      insertColumns += ", CreatedAt, UpdatedAt"
      insertValues += ", GETDATE(), GETDATE()"
    }
    
    await requestBuilder.query(`
      INSERT INTO Users (${insertColumns})
      VALUES (${insertValues})
    `)

    return NextResponse.json({
      success: true,
      message: "用户创建成功",
    })
  } catch (error: any) {
    console.error("创建用户失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "创建用户时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}
