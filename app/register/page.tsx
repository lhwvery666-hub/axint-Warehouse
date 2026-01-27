"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, FileText, ArrowLeft, AlertCircle } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 验证手机号格式
  const validatePhoneNumber = (phone: string) => {
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phone) {
      setPhoneError("手机号为必填项")
      return false
    }
    if (!phoneRegex.test(phone)) {
      setPhoneError("手机号格式不正确，请输入11位有效手机号")
      return false
    }
    setPhoneError(null)
    return true
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    
    try {
      // 验证表单
      if (!username || !password || !confirmPassword || !name || !phoneNumber) {
        throw new Error("请填写所有必填字段")
      }
      
      if (!validatePhoneNumber(phoneNumber)) {
        throw new Error(phoneError || "手机号格式不正确")
      }
      
      if (password !== confirmPassword) {
        throw new Error("两次输入的密码不一致")
      }
      
      if (password.length < 6) {
        throw new Error("密码长度至少为6位")
      }
      
      // 调用后端注册接口，将用户写入 SQL Server 的 Users 表（不在前端保存密码）
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          realName: name,
          phoneNumber,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "注册失败，请重试")
      }

      alert("注册成功！您的账号已创建，默认角色为普通员工")
      
      // 重定向到登录页面
      router.push("/login")
    } catch (error: any) {
      setError(error.message || "注册失败，请重试")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl"></div>
      </div>
      
      <Card className="w-full max-w-md shadow-2xl border-border/50 backdrop-blur-sm bg-card/95 relative z-10">
        <CardHeader className="space-y-3 flex flex-col items-center pb-6">
          <div className="w-20 h-20 mb-3 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center shadow-lg">
            <Image 
              src="/icon.svg" 
              alt="智能维修系统" 
              width={48} 
              height={48} 
              className="text-primary-foreground" 
            />
          </div>
          <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            注册新账号
          </CardTitle>
          <CardDescription className="text-center text-base">创建您的现场报告人员账号</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">用户名</Label>
              <Input 
                id="username" 
                placeholder="请输入用户名" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">真实姓名</Label>
              <Input 
                id="name" 
                placeholder="请输入您的真实姓名" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-sm font-medium">手机号 <span className="text-destructive">*</span></Label>
              <Input 
                id="phoneNumber" 
                type="tel"
                placeholder="请输入11位手机号" 
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '') // 只允许数字
                  setPhoneNumber(value)
                  if (value) {
                    validatePhoneNumber(value)
                  } else {
                    setPhoneError(null)
                  }
                }}
                maxLength={11}
                required
                className={phoneError ? "h-11 border-destructive" : "h-11"}
              />
              {phoneError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {phoneError}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">密码</Label>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="请输入密码" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">确认密码</Label>
              <div className="relative">
                <Input 
                  id="confirmPassword" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="请再次输入密码" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
            </div>
            
            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-2">
              <Button 
                type="submit"
                className="w-full h-11 text-base font-semibold shadow-lg hover:shadow-xl transition-all" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    注册中...
                  </div>
                ) : (
                  "注册"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-center">
            <span className="text-muted-foreground">已有账号？</span>{" "}
            <Link href="/login" className="text-primary hover:underline">
              登录
            </Link>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="mt-2"
            onClick={() => router.push("/login")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回登录
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}