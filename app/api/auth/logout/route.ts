import { NextResponse } from "next/server"
import { cookies } from "next/headers"

// POST /api/auth/logout
// 用户登出，清除 session cookie
export async function POST() {
  try {
    const cookieStore = await cookies()
    cookieStore.delete("session")
    cookieStore.delete("userId")
    cookieStore.delete("userRole")  // 同时清除角色 cookie
    cookieStore.delete("user")

    return NextResponse.json({
      success: true,
      message: "登出成功",
    })
  } catch (error: any) {
    console.error("登出失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "登出时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}
