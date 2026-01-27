"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/context/auth-context"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // 每次进入登录页面时清空输入框
  useEffect(() => {
    setUsername("")
    setPassword("")
    setShowPassword(false)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      // 直接调用认证上下文中的登录方法，角色由后端根据账号自动识别
      await login(username, password, null)
    } catch (error: any) {
      console.error("登录失败", error)
      alert('登录失败: ' + (error.message || '请检查用户名和密码'))
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
            智能维修系统
          </CardTitle>
          <CardDescription className="text-center text-base">请登录以继续使用系统</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">用户名</Label>
              <Input 
                id="username" 
                name="username"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                placeholder="请输入用户名" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">密码</Label>
              <div className="relative">
                <Input 
                  id="password" 
                  name="password"
                  type={showPassword ? "text" : "password"} 
                  autoComplete="new-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
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
                    登录中...
                  </div>
                ) : (
                  "登录"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 pt-6">
          <div className="text-sm text-muted-foreground text-center flex items-center justify-center gap-3">
            <a href="#" className="text-primary hover:text-primary/80 transition-colors font-medium">忘记密码?</a>
            <span className="text-border">|</span>
            <Link href="/register" className="text-primary hover:text-primary/80 transition-colors font-medium">
              注册新账号
            </Link>
          </div>
          {/* 出于安全考虑，这里不再在前端展示具体账号与密码示例 */}
        </CardFooter>
      </Card>
    </div>
  )
}