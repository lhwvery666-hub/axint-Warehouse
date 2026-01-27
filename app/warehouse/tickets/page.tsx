"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Save, RefreshCw, Search, Package, Loader2, CheckCircle, AlertCircle, Database, ClipboardList, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";

interface Ticket {
  id: string;
  deviceName: string;
  deviceModel: string;
  deviceSerialNumber: string;
  productSN: string;
  projectLocation: string;
  status: string;
  reportedAt: string;
  // 仓库管理员填写区
  receivedDate: string | null;
  factoryShipDate: string | null;
  returnDate: string | null;
  returnQuantity: number | null;
  returnTrackingNum: string | null;
}

interface WarehouseFormData {
  receivedDate: Date | null;
  factoryShipDate: Date | null;
  returnDate: Date | null;
  returnQuantity: number;
  returnTrackingNum: string;
}

export default function WarehouseTicketsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [formData, setFormData] = useState<WarehouseFormData>({
    receivedDate: null,
    factoryShipDate: null,
    returnDate: null,
    returnQuantity: 1,
    returnTrackingNum: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // 加载工单列表
  useEffect(() => {
    loadTickets();
  }, []);

  // 搜索过滤
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTickets(tickets);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTickets(
        tickets.filter(
          (ticket) =>
            ticket.deviceName?.toLowerCase().includes(query) ||
            ticket.deviceSerialNumber?.toLowerCase().includes(query) ||
            ticket.productSN?.toLowerCase().includes(query) ||
            ticket.projectLocation?.toLowerCase().includes(query) ||
            ticket.returnTrackingNum?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, tickets]);

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/tickets");
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // 筛选出仓库管理员需要处理的工单：Pending_Shipment 和 Return_Unrepaired
          const warehouseTickets = result.data.filter((ticket: any) => {
            const status = (ticket.status || "").toString().trim();
            const statusLower = status.toLowerCase();
            // 支持多种状态格式（大小写不敏感）
            return statusLower === "pending_shipment" || 
                   statusLower === "return_unrepaired" ||
                   status === "Pending_Shipment" || 
                   status === "Return_Unrepaired";
          });
          
          // 获取每个工单的详细信息（包含仓库管理员字段）
          const ticketsWithDetails = await Promise.all(
            warehouseTickets.map(async (ticket: any) => {
              try {
                const detailResponse = await fetch(`/api/tickets/${ticket.id}`);
                if (detailResponse.ok) {
                  const detailResult = await detailResponse.json();
                  if (detailResult.success) {
                    return {
                      ...ticket,
                      receivedDate: detailResult.data.receivedDate || null,
                      factoryShipDate: detailResult.data.factoryShipDate || null,
                      returnDate: detailResult.data.returnDate || null,
                      returnQuantity: detailResult.data.returnQuantity || null,
                      returnTrackingNum: detailResult.data.returnTrackingNum || null,
                    };
                  }
                }
              } catch (error) {
                console.error(`加载工单 ${ticket.id} 详情失败:`, error);
              }
              return {
                ...ticket,
                receivedDate: null,
                factoryShipDate: null,
                returnDate: null,
                returnQuantity: null,
                returnTrackingNum: null,
              };
            })
          );
          setTickets(ticketsWithDetails);
        }
      }
    } catch (error) {
      console.error("加载工单列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setFormData({
      receivedDate: ticket.receivedDate ? parseISO(ticket.receivedDate) : null,
      factoryShipDate: ticket.factoryShipDate ? parseISO(ticket.factoryShipDate) : null,
      returnDate: ticket.returnDate ? parseISO(ticket.returnDate) : null,
      returnQuantity: ticket.returnQuantity || 1,
      returnTrackingNum: ticket.returnTrackingNum || "",
    });
    setSaveResult(null);
  };

  const handleSave = async () => {
    if (!selectedTicket) return;

    setIsSaving(true);
    setSaveResult(null);

    try {
      const updateData: any = {};

      if (formData.receivedDate) {
        updateData.receivedDate = formData.receivedDate.toISOString();
      }
      if (formData.factoryShipDate) {
        updateData.factoryShipDate = formData.factoryShipDate.toISOString();
      }
      if (formData.returnDate) {
        updateData.returnDate = formData.returnDate.toISOString();
      }
      if (formData.returnQuantity) {
        updateData.returnQuantity = formData.returnQuantity;
      }
      if (formData.returnTrackingNum) {
        updateData.returnTrackingNum = formData.returnTrackingNum;
      }

      const response = await fetch(`/api/tickets/${selectedTicket.id}/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (result.success) {
        setSaveResult({ success: true, message: "保存成功！" });
        // 刷新列表
        setTimeout(() => {
          loadTickets();
          setSelectedTicket(null);
          setSaveResult(null);
        }, 1500);
      } else {
        setSaveResult({ success: false, message: result.message || "保存失败" });
      }
    } catch (error: any) {
      console.error("保存失败:", error);
      setSaveResult({ success: false, message: error.message || "保存失败" });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      Created: { label: "待处理", variant: "outline" },
      In_Repair: { label: "维修中", variant: "default" },
      Admin_Review: { label: "待审核", variant: "secondary" },
      Pending_Shipment: { label: "待发货", variant: "secondary" },
      Completed: { label: "已完成", variant: "default" },
      Unrepairable: { label: "无法维修", variant: "destructive" },
      Return_Unrepaired: { label: "拒修退回", variant: "outline" },
      Scrapped: { label: "已报废", variant: "destructive" },
      Cancelled: { label: "已取消", variant: "outline" },
    };
    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const isFormComplete = (ticket: Ticket) => {
    return (
      ticket.receivedDate &&
      ticket.factoryShipDate &&
      ticket.returnDate &&
      ticket.returnQuantity &&
      ticket.returnTrackingNum
    );
  };

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

      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold flex items-center gap-3">
                <Package className="h-6 w-6 text-primary" />
                仓库管理员填写表格
              </CardTitle>
              <CardDescription className="mt-2">
                填写工单的收到日期、出厂日期、返还日期、返还数量和快递单号
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadTickets} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button 
                onClick={() => {
                  window.open("/api/tickets/export", "_blank");
                }}
                variant="outline" 
                size="sm"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                导出Excel总表
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 搜索框 */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索设备名称、序列号、项目地点或快递单号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无工单数据</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 工单列表 */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">状态</TableHead>
                      <TableHead>设备名称</TableHead>
                      <TableHead>序列号</TableHead>
                      <TableHead>项目地点</TableHead>
                      <TableHead>收到日期</TableHead>
                      <TableHead>出厂日期</TableHead>
                      <TableHead>返还日期</TableHead>
                      <TableHead>返还数量</TableHead>
                      <TableHead>快递单号</TableHead>
                      <TableHead className="w-24">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                        <TableCell className="font-medium">{ticket.deviceName || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{ticket.productSN || ticket.deviceSerialNumber || "-"}</TableCell>
                        <TableCell>{ticket.projectLocation || "-"}</TableCell>
                        <TableCell>
                          {ticket.receivedDate ? (
                            <span className="text-sm">{format(parseISO(ticket.receivedDate), "yyyy-MM-dd", { locale: zhCN })}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">未填写</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ticket.factoryShipDate ? (
                            <span className="text-sm">{format(parseISO(ticket.factoryShipDate), "yyyy-MM-dd", { locale: zhCN })}</span>
                          ) : (
                            <span className="text-destructive text-sm font-semibold">⚠️ 未填写出厂日期</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ticket.returnDate ? (
                            <span className="text-sm">{format(parseISO(ticket.returnDate), "yyyy-MM-dd", { locale: zhCN })}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">未填写</span>
                          )}
                        </TableCell>
                        <TableCell>{ticket.returnQuantity || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{ticket.returnTrackingNum || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isFormComplete(ticket) && (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditTicket(ticket)}
                            >
                              编辑
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 编辑对话框 */}
      {selectedTicket && (
        <Card className="sticky bottom-0 border-t shadow-lg">
          <CardHeader>
            <CardTitle>编辑工单信息</CardTitle>
            <CardDescription>
              工单ID: {selectedTicket.id} | 设备: {selectedTicket.deviceName || selectedTicket.deviceSerialNumber}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {saveResult && (
              <div
                className={cn(
                  "p-3 rounded-md flex items-center gap-2",
                  saveResult.success
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                )}
              >
                {saveResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span className="text-sm">{saveResult.message}</span>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="receivedDate">收到日期 *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="receivedDate"
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal mt-1", !formData.receivedDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.receivedDate ? (
                        format(formData.receivedDate, "yyyy-MM-dd", { locale: zhCN })
                      ) : (
                        <span>选择日期</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.receivedDate || undefined}
                      onSelect={(date) => setFormData({ ...formData, receivedDate: date || null })}
                      initialFocus
                      locale={zhCN}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="factoryShipDate">出厂日期 *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="factoryShipDate"
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal mt-1", !formData.factoryShipDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.factoryShipDate ? (
                        format(formData.factoryShipDate, "yyyy-MM-dd", { locale: zhCN })
                      ) : (
                        <span>选择日期</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.factoryShipDate || undefined}
                      onSelect={(date) => setFormData({ ...formData, factoryShipDate: date || null })}
                      initialFocus
                      locale={zhCN}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="returnDate">返还客户日期 *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="returnDate"
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal mt-1", !formData.returnDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.returnDate ? (
                        format(formData.returnDate, "yyyy-MM-dd", { locale: zhCN })
                      ) : (
                        <span>选择日期</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.returnDate || undefined}
                      onSelect={(date) => setFormData({ ...formData, returnDate: date || null })}
                      initialFocus
                      locale={zhCN}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="returnQuantity">返还客户数量 *</Label>
                <Input
                  id="returnQuantity"
                  type="number"
                  min="1"
                  value={formData.returnQuantity}
                  onChange={(e) => setFormData({ ...formData, returnQuantity: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="returnTrackingNum">返还客户快递单号 *</Label>
                <Input
                  id="returnTrackingNum"
                  value={formData.returnTrackingNum}
                  onChange={(e) => setFormData({ ...formData, returnTrackingNum: e.target.value })}
                  placeholder="请输入快递单号"
                  className="mt-1 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    保存
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
