import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"

// POST /api/auth/register
// 用户注册账号，写入 Users 表，默认角色为 User（普通员工）
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password, realName, phoneNumber } = body ?? {}

    if (!username || !password || !realName || !phoneNumber) {
      return NextResponse.json(
        { success: false, message: "用户名、密码、姓名和手机号为必填项" },
        { status: 400 }
      )
    }

    // 验证手机号格式（11位数字，以1开头）
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phoneRegex.test(phoneNumber)) {
      return NextResponse.json(
        { success: false, message: "手机号格式不正确，请输入11位有效手机号" },
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

    // 检查手机号是否已存在
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

    // 加密密码
    const bcrypt = require('bcryptjs')
    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // 检查表结构，确定哪些字段存在
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' 
        AND COLUMN_NAME IN ('PhoneNumber', 'CreatedAt', 'UpdatedAt')
      `)
    
    const columnNames = columnCheck.recordset.map((row: any) => row.COLUMN_NAME)
    const hasPhoneNumber = columnNames.includes('PhoneNumber')
    const hasCreatedAt = columnNames.includes('CreatedAt')
    const hasUpdatedAt = columnNames.includes('UpdatedAt')

    // 构建INSERT语句，确保Role字段总是被设置（硬编码为'User'）
    const requestBuilder = pool.request()
      .input("username", username)
      .input("password", hashedPassword)
      .input("realName", realName)
      .input("role", "User") // 硬编码默认角色为 'User'

    let insertColumns = "Username, Password, RealName, Role"
    let insertValues = "@username, @password, @realName, @role"

    // 如果表有 PhoneNumber 字段，添加手机号
    if (hasPhoneNumber) {
      insertColumns += ", PhoneNumber"
      insertValues += ", @phoneNumber"
      requestBuilder.input("phoneNumber", phoneNumber)
    }

    // 如果表有 CreatedAt 和 UpdatedAt 字段，添加时间戳
    if (hasCreatedAt && hasUpdatedAt) {
      insertColumns += ", CreatedAt, UpdatedAt"
      insertValues += ", GETUTCDATE(), GETUTCDATE()"
    }

    // 执行插入
    await requestBuilder.query(`
      INSERT INTO Users (${insertColumns})
      VALUES (${insertValues})
    `)

    return NextResponse.json({
      success: true,
      message: "注册成功",
    })
  } catch (error: any) {
    console.error("注册接口错误:", error)
    return NextResponse.json(
      {
        success: false,
        message: "注册服务异常，请稍后重试",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

