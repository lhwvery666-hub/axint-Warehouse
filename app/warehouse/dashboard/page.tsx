"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Database, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import DatabaseManager from "@/components/admin/database-manager";

export default function WarehouseDashboard() {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      {/* 导航栏 */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-6">
          <nav className="flex gap-2 py-3">
            <Link href="/warehouse/dashboard">
              <Button
                variant={pathname === "/warehouse/dashboard" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "flex items-center gap-2",
                  pathname === "/warehouse/dashboard" && "bg-primary text-primary-foreground"
                )}
              >
                <Database className="h-4 w-4" />
                数据库管理
              </Button>
            </Link>
            <Link href="/warehouse/tickets">
              <Button
                variant={pathname === "/warehouse/tickets" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "flex items-center gap-2",
                  pathname === "/warehouse/tickets" && "bg-primary text-primary-foreground"
                )}
              >
                <ClipboardList className="h-4 w-4" />
                填写表格
              </Button>
            </Link>
          </nav>
        </div>
      </div>

      {/* 内容区域 */}
      <DatabaseManager />
    </div>
  );
}
