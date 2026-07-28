"use client"

import React, { createContext, useContext, useState, useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { UserRole } from "@/lib/enums"

type AuthStatus = "authenticated" | "unauthenticated" | "loading"

interface User {
  id: string
  username: string
  realName: string
  role: UserRole | null
  avatar?: string
  phone?: string
}

interface AuthContextType {
  user: User | null
  status: AuthStatus
  login: (username: string, password: string, role: UserRole | null) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const router = useRouter()
  const pathname = usePathname()
  const redirectingRef = useRef(false) // 防止重复重定向

  // 从 API 获取当前用户信息
  const refreshUser = async () => {
    try {
      const res = await fetch("/api/auth/me")
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.user) {
          const backendUser = json.user as {
            id: string
            username: string
            role: string
            realName: string
            phone?: string
          }

          // 将数据库中的角色字符串映射为前端使用的枚举
          const dbRole = (backendUser.role || "").toLowerCase().trim()
          const mappedRole: UserRole | null =
            dbRole === "admin"
              ? UserRole.ADMIN
              : dbRole === "technician" || dbRole === "维修工程师" || dbRole === "维修人员"
              ? UserRole.TECHNICIAN
              : dbRole === "warehouse" || dbRole === "warehouse_manager" || dbRole === "warehousemanager" || dbRole === "warehouse_admin" || dbRole === "warehouseadmin" || dbRole === "仓库管理员" || dbRole === "仓库"
              ? UserRole.WAREHOUSE
              : dbRole === "reporter" || dbRole === "site" || dbRole === "fieldreporter" || dbRole === "现场报告人员" || dbRole === "现场人员"
              ? UserRole.REPORTER
              : dbRole === "business" || dbRole === "商务" || dbRole === "商务人员" || dbRole === "商务管理员"
              ? UserRole.BUSINESS
              : null

          if (mappedRole) {
            const authUser: User = {
              id: backendUser.id,
              username: backendUser.username,
              realName: backendUser.realName,
              role: mappedRole,
              avatar: "/placeholder-user.jpg",
              phone: backendUser.phone || "",
            }
            setUser(authUser)
            setStatus("authenticated")
          } else {
            // 如果角色是 "User" 或其他无效角色，清除cookie并设置为未认证
            console.warn(`用户 ${backendUser.id} (${backendUser.realName}) 的角色 "${backendUser.role}" 无效，无法访问系统`)
            // 清除cookie
            try {
              await fetch("/api/auth/logout", { method: "POST" })
            } catch (e) {
              console.error("清除cookie失败:", e)
            }
            setUser(null)
            setStatus("unauthenticated")
          }
        } else {
          setUser(null)
          setStatus("unauthenticated")
        }
      } else {
        setUser(null)
        setStatus("unauthenticated")
      }
    } catch (error) {
      console.error("获取用户信息失败:", error)
      setUser(null)
      setStatus("unauthenticated")
    }
  }

  // 初始化时从 API 验证用户状态
  // 注意：只有在有有效 cookie 时才会自动登录
  useEffect(() => {
    // 延迟一下，确保路由保护逻辑能正确执行
    const timer = setTimeout(() => {
      refreshUser()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // 路由保护
  useEffect(() => {
    if (status === "loading") return

    // 未认证用户访问受保护页面，重定向到登录页
    // 但是排除 /admin/database，因为它的 layout 会自己处理权限
    if (status === "unauthenticated" && pathname !== "/login" && pathname !== "/register") {
      // 如果是 /admin/database 相关页面，让 layout 自己处理，不要在这里重定向
      if (pathname.startsWith("/admin/database")) {
        return
      }
      if (!redirectingRef.current) {
        redirectingRef.current = true
        router.push("/login")
        setTimeout(() => {
          redirectingRef.current = false
        }, 3000)
      }
      return
    }

    // 已认证用户访问登录页，重定向到相应页面
    // 只有在用户信息已加载时才重定向，避免循环
    if (status === "authenticated" && pathname === "/login" && user && !redirectingRef.current) {
      redirectingRef.current = true
      // 延迟重定向，确保状态稳定
      setTimeout(() => {
        if (user.role === UserRole.TECHNICIAN) {
          router.push("/technician/tasks")
        } else if (user.role === UserRole.REPORTER) {
          router.push("/report")
        } else if (user.role === UserRole.ADMIN) {
          router.push("/admin/users")
        } else if (user.role === UserRole.WAREHOUSE) {
          router.push("/warehouse/dashboard")
        } else if (user.role === UserRole.BUSINESS) {
          router.push("/business")
        } else {
          router.push("/")
        }
        setTimeout(() => {
          redirectingRef.current = false
        }, 3000)
      }, 200) // 延迟 200ms 确保状态稳定
    }
  }, [status, pathname, router, user])

  const login = async (username: string, password: string, selectedRole: UserRole | null) => {
    try {
      setStatus("loading")

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok || !json?.success || !json.user) {
        setStatus("unauthenticated")
        throw new Error(json?.message || "账号或密码错误")
      }

      const backendUser = json.user as {
        id: string
        username: string
        role: string
        realName: string
        phone?: string
      }

          // 将数据库中的角色字符串映射为前端使用的枚举
          const dbRole = (backendUser.role || "").toLowerCase().trim()
          const mappedRole: UserRole | null =
            dbRole === "admin"
              ? UserRole.ADMIN
              : dbRole === "technician" || dbRole === "维修工程师" || dbRole === "维修人员"
              ? UserRole.TECHNICIAN
              : dbRole === "warehouse" || dbRole === "warehouse_manager" || dbRole === "warehousemanager" || dbRole === "warehouse_admin" || dbRole === "warehouseadmin" || dbRole === "仓库管理员" || dbRole === "仓库"
              ? UserRole.WAREHOUSE
              : dbRole === "reporter" || dbRole === "site" || dbRole === "fieldreporter" || dbRole === "现场报告人员" || dbRole === "现场人员"
              ? UserRole.REPORTER
              : dbRole === "business" || dbRole === "商务" || dbRole === "商务人员" || dbRole === "商务管理员"
              ? UserRole.BUSINESS
              : null

      if (!mappedRole) {
        setStatus("unauthenticated")
        // 清除可能存在的cookie
        try {
          await fetch("/api/auth/logout", { method: "POST" })
        } catch (e) {
          console.error("清除cookie失败:", e)
        }
        throw new Error(`当前账号的角色配置无效（当前角色：${backendUser.role || "未设置"}），请联系管理员将您的角色修改为"维修工程师"、"现场报告人员"、"管理员"、"仓库管理员"或"商务人员"`)
      }

      // 角色由后端根据账号自动识别，不再需要前端选择

      const authUser: User = {
        id: backendUser.id,
        username: backendUser.username,
        realName: backendUser.realName,
        role: mappedRole,
        avatar: "/placeholder-user.jpg",
        phone: backendUser.phone || "",
      }

      // 先设置用户和状态，使用 React 的批处理确保同步更新
      setUser(authUser)
      setStatus("authenticated")

      // 设置重定向标志，防止路由保护逻辑同时触发
      redirectingRef.current = true

      // 使用 requestAnimationFrame 确保 DOM 更新完成后再重定向
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 重定向
          if (mappedRole === UserRole.TECHNICIAN) {
            router.push("/technician/tasks")
          } else if (mappedRole === UserRole.REPORTER) {
            router.push("/report")
          } else if (mappedRole === UserRole.ADMIN) {
            router.push("/admin/users")
          } else if (mappedRole === UserRole.WAREHOUSE) {
            router.push("/warehouse/dashboard")
          } else if (mappedRole === UserRole.BUSINESS) {
            router.push("/business")
          } else {
            router.push("/")
          }
          
          // 3秒后重置重定向标志
          setTimeout(() => {
            redirectingRef.current = false
          }, 3000)
        })
      })
    } catch (error) {
      console.error("登录失败:", error)
      setStatus("unauthenticated")
      throw error
    }
  }

  const logout = async () => {
    try {
      // 调用后端登出 API 清除 cookie
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (error) {
      console.error("登出 API 调用失败:", error)
    }
    
    // 更新状态
    setUser(null)
    setStatus("unauthenticated")
    
    // 重定向到登录页
    router.push("/login")
  }

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
