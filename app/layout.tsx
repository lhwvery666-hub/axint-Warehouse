import type React from "react"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/context/auth-context"
import { RepairProvider } from "@/context/RepairContext"
import { NotificationProvider } from "@/context/NotificationContext"
import "./globals.css"

export const metadata: Metadata = {
  title: "智能维修系统",
  description: "工业设备维修管理系统",
    generator: 'v0.app'
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3b82f6",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <RepairProvider>
              <NotificationProvider>
                {children}
                <Analytics />
              </NotificationProvider>
            </RepairProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
