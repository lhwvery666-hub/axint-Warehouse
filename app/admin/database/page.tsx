"use client";

import DatabaseManager from "@/components/admin/database-manager";

export default function AdminDatabasePage() {
  // 权限检查由 layout.tsx 处理，这里直接渲染内容
  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6">
        <DatabaseManager />
      </div>
    </div>
  );
}