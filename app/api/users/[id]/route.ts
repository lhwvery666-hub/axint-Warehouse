import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
const bcrypt = require('bcryptjs')

// GET /api/users/[id]
// 获取单个用户信息
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params

    const userId = resolvedParams?.id

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "用户ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 检查表结构
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME IN ('CreatedAt', 'UpdatedAt', 'PhoneNumber')
      `)
    
    const hasCreatedAt = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'CreatedAt')
    const hasUpdatedAt = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'UpdatedAt')
    const hasPhoneNumber = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === 'PhoneNumber')
    
    let selectFields = "UserID, Username, Role, RealName"
    if (hasPhoneNumber) selectFields += ", PhoneNumber"
    if (hasCreatedAt) selectFields += ", CreatedAt"
    if (hasUpdatedAt) selectFields += ", UpdatedAt"
    
    const result = await pool
      .request()
      .input("userId", userId)
      .query(`
        SELECT ${selectFields}
        FROM Users
        WHERE UserID = @userId
      `)

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      )
    }

    const row = result.recordset[0]

    return NextResponse.json({
      success: true,
      data: {
        id: row.UserID?.toString() || "",
        username: row.Username || "",
        role: row.Role || "",
        realName: row.RealName || "",
        phoneNumber: hasPhoneNumber ? (row.PhoneNumber || "") : "",
        createdAt: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : null,
        updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
      },
    })
  } catch (error: any) {
    console.error("获取用户信息失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取用户信息时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

// PUT /api/users/[id]
// 更新用户信息
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params

    const userId = resolvedParams?.id
    const body = await request.json()
    const { username, password, realName, role, phoneNumber } = body ?? {}

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "用户ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 检查用户是否存在
    const userResult = await pool
      .request()
      .input("userId", userId)
      .query(`SELECT Username FROM Users WHERE UserID = @userId`)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      )
    }

    // 如果更新用户名，检查是否重复
    if (username) {
      const existsResult = await pool
        .request()
        .input("username", username)
        .input("userId", userId)
        .query(`SELECT 1 FROM Users WHERE Username = @username AND UserID != @userId`)

      if (existsResult.recordset.length > 0) {
        return NextResponse.json(
          { success: false, message: "用户名已存在，请使用其他用户名" },
          { status: 400 }
        )
      }
    }

    // 如果更新手机号，验证格式并检查是否重复
    if (phoneNumber !== undefined) {
      if (phoneNumber) {
        const phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(phoneNumber)) {
          return NextResponse.json(
            { success: false, message: "手机号格式不正确，请输入11位有效手机号" },
            { status: 400 }
          )
        }
        
        // 检查手机号是否已被其他用户使用
        const phoneExistsResult = await pool
          .request()
          .input("phoneNumber", phoneNumber)
          .input("userId", userId)
          .query(`SELECT 1 FROM Users WHERE PhoneNumber = @phoneNumber AND UserID != @userId`)

        if (phoneExistsResult.recordset.length > 0) {
          return NextResponse.json(
            { success: false, message: "该手机号已被其他用户使用" },
            { status: 400 }
          )
        }
      }
    }

    // 验证角色 —— 使用大小写不敏感匹配，兼容 PascalCase 与 lowercase 两种写法
    const validRoles = ["Admin", "Technician", "Warehouse", "Reporter", "Business", "User"]
    if (role !== undefined && role !== null && role !== "" &&
        !validRoles.some(r => r.toLowerCase() === role.toLowerCase())) {
      return NextResponse.json(
        { success: false, message: `角色必须是以下之一: ${validRoles.join(", ")}` },
        { status: 400 }
      )
    }

    // 检查表是否有 PhoneNumber 字段
    const phoneColumnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'PhoneNumber'
      `)
    const hasPhoneNumber = phoneColumnCheck.recordset.length > 0

    // 构建更新语句
    const updates: string[] = []
    const dbRequest = pool.request()

    if (username) {
      updates.push("Username = @username")
      dbRequest.input("username", username)
    }
    if (password) {
      const saltRounds = 10
      const hashedPassword = await bcrypt.hash(password, saltRounds)
      updates.push("Password = @password")
      dbRequest.input("password", hashedPassword)
    }
    if (realName) {
      updates.push("RealName = @realName")
      dbRequest.input("realName", realName)
    }
    if (hasPhoneNumber && phoneNumber !== undefined) {
      updates.push("PhoneNumber = @phoneNumber")
      dbRequest.input("phoneNumber", phoneNumber || null)
    }
    if (role !== undefined) {
      updates.push("Role = @role")
      dbRequest.input("role", role || null)
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, message: "没有要更新的字段" },
        { status: 400 }
      )
    }

    // 检查是否有 UpdatedAt 字段
    const hasUpdatedAt = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'UpdatedAt'
      `)
    
    if (hasUpdatedAt.recordset.length > 0) {
      updates.push("UpdatedAt = GETDATE()")
    }
    
    dbRequest.input("userId", userId)

    const updateQuery = `
      UPDATE Users
      SET ${updates.join(", ")}
      WHERE UserID = @userId
    `
    
    console.log("执行更新SQL:", updateQuery)
    console.log("更新参数:", {
      userId,
      username,
      realName,
      phoneNumber,
      role,
      hasPassword: !!password
    })

    await dbRequest.query(updateQuery)

    return NextResponse.json({
      success: true,
      message: "用户更新成功",
    })
  } catch (error: any) {
    console.error("更新用户失败:", error)
    console.error("错误详情:", {
      message: error?.message,
      code: error?.code,
      number: error?.number,
      originalError: error?.originalError,
      stack: error?.stack
    })
    return NextResponse.json(
      {
        success: false,
        message: "更新用户时发生错误",
        error: error?.message || "未知错误",
        details: process.env.NODE_ENV === "development" ? {
          code: error?.code,
          number: error?.number,
          originalError: error?.originalError?.message
        } : undefined
      },
      { status: 500 }
    )
  }
}

// DELETE /api/users/[id]
// 删除用户
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params

    const userId = resolvedParams?.id

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "用户ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 检查用户是否存在
    const userResult = await pool
      .request()
      .input("userId", userId)
      .query(`SELECT Username, Role FROM Users WHERE UserID = @userId`)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      )
    }

    const user = userResult.recordset[0]
    
    // 防止删除管理员账号（可选，根据需求）
    if (user.Role === "Admin") {
      return NextResponse.json(
        { success: false, message: "不能注销管理员账号" },
        { status: 400 }
      )
    }

    // 检查是否存在 IsDeleted 字段
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'IsDeleted'
      `)
    const hasIsDeleted = columnCheck.recordset.length > 0

    if (!hasIsDeleted) {
      // 如果没有软删除字段，避免误删，直接返回错误提示
      return NextResponse.json(
        { success: false, message: "当前数据库未配置软删除字段 IsDeleted，请先更新表结构" },
        { status: 500 }
      )
    }

    // 执行软删除：将 IsDeleted 标记为 1，而不是物理删除
    await pool
      .request()
      .input("userId", userId)
      .query(`
        UPDATE Users
        SET IsDeleted = 1
        WHERE UserID = @userId
      `)

    return NextResponse.json({
      success: true,
      message: "用户已注销（软删除），历史工单仍可保留姓名与电话",
    })
  } catch (error: any) {
    console.error("删除用户失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "删除用户时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}
