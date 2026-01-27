"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Trash2, RotateCcw, Clock, ArrowLeft } from "lucide-react";

interface RecycleTicket {
  id: string;
  deviceSerialNumber: string;
  deviceName: string;
  projectLocation: string;
  problem: string;
  status: string;
  reportedAt: string;
}

export default function RecycleBinPage() {
  const [tickets, setTickets] = useState<RecycleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadDeletedTickets = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/tickets");
        const json = await resp.json();
        if (!resp.ok || !json?.success) {
          throw new Error(json?.message || json?.error || "加载回收站工单失败");
        }

        const all: any[] = Array.isArray(json.data) ? json.data : [];
        const deleted = all.filter(
          (t) => (t.status || "").toLowerCase() === "deleted"
        );

        const mapped: RecycleTicket[] = deleted.map((t) => ({
          id: t.id?.toString() || "",
          deviceSerialNumber: t.deviceSerialNumber || "",
          deviceName: t.deviceName || t.deviceModel || "未知设备",
          projectLocation: t.projectLocation || "",
          problem: t.problem || "",
          status: t.status || "Deleted",
          reportedAt: t.reportedAt || "",
        }));

        setTickets(mapped);
      } catch (e: any) {
        setError(e?.message || "加载回收站工单失败");
        setTickets([]);
      } finally {
        setLoading(false);
      }
    };

    loadDeletedTickets();
  }, []);

  // 恢复工单：将状态改回 Pending，并从回收站列表移除
  const handleRestore = async (id: string) => {
    try {
      const resp = await fetch(`/api/tickets/${id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) {
        throw new Error(json?.message || json?.error || "恢复工单失败");
      }
      setTickets((prev) => prev.filter((t) => t.id !== id));
      alert("工单已从回收站恢复");
    } catch (e: any) {
      alert(e?.message || "恢复工单失败，请稍后重试");
    }
  };

  // 彻底删除工单：从数据库物理删除
  const handleHardDelete = async (id: string) => {
    if (!confirm("确定要彻底删除这个工单吗？此操作不可恢复！")) return;
    try {
      const resp = await fetch(`/api/tickets/${id}`, {
        method: "DELETE",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.message || json?.error || "彻底删除工单失败");
      }
      setTickets((prev) => prev.filter((t) => t.id !== id));
      alert("工单已彻底删除");
    } catch (e: any) {
      alert(e?.message || "彻底删除工单失败，请稍后重试");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-screen bg-background">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">工单回收站</h1>
            <p className="text-sm text-muted-foreground">
              这里只显示已删除的工单，正常页面中不会再出现。
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">加载回收站工单中...</p>
          </div>
        </div>
      ) : error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : tickets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="font-medium">回收站里目前没有工单</p>
            <p className="text-sm text-muted-foreground">
              当你在详情页删除工单后，会出现在这里。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="border-border/60">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    {ticket.deviceName}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    序列号：{ticket.deviceSerialNumber || "未知"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-destructive border-destructive/40"
                >
                  已删除
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">项目地点：</span>
                  {ticket.projectLocation || "未填写"}
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  <span className="font-medium">故障描述：</span>
                  {ticket.problem || "未填写"}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  删除前报修时间：{ticket.reportedAt || "未知"}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1"
                    onClick={() => handleRestore(ticket.id)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    恢复
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => handleHardDelete(ticket.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    彻底删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

