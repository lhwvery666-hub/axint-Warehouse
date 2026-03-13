"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Copy, Loader2, Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CustomerInfo {
  name: string;
  contact: string;
  phone: string;
  address: string;
  receivedDate: Date | null;
}

interface DeviceItem {
  productModel: string;
  deviceSn: string;
  faultDesc: string;
  accessories: string;
}

interface BatchFormData {
  customerInfo: CustomerInfo;
  items: DeviceItem[];
}

export default function BatchCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BatchFormData>({
    defaultValues: {
      customerInfo: {
        name: "",
        contact: "",
        phone: "",
        address: "",
        receivedDate: new Date(),
      },
      items: [
        {
          productModel: "",
          deviceSn: "",
          faultDesc: "",
          accessories: "",
        },
      ],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "items",
  });

  const customerInfo = watch("customerInfo");
  const items = watch("items");

  // 添加新行
  const handleAddRow = () => {
    append({
      productModel: "",
      deviceSn: "",
      faultDesc: "",
      accessories: "",
    });
  };

  // 复制上一行
  const handleCopyLastRow = () => {
    if (items.length === 0) {
      handleAddRow();
      return;
    }
    const lastItem = items[items.length - 1];
    append({
      productModel: lastItem.productModel,
      deviceSn: "",
      faultDesc: lastItem.faultDesc,
      accessories: lastItem.accessories,
    });
  };

  // 提交表单
  const onSubmit = async (data: BatchFormData) => {
    // 验证客户信息
    if (!data.customerInfo.name || !data.customerInfo.contact || !data.customerInfo.phone) {
      toast({
        title: "验证失败",
        description: "客户名称、联系人和电话为必填项",
        variant: "destructive",
      });
      return;
    }

    // 验证设备明细
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item.productModel || !item.deviceSn) {
        toast({
          title: "验证失败",
          description: `第 ${i + 1} 行：设备型号和序列号为必填项`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/tickets/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerInfo: {
            name: data.customerInfo.name,
            contact: data.customerInfo.contact,
            phone: data.customerInfo.phone,
            address: data.customerInfo.address || "",
            receivedDate: data.customerInfo.receivedDate
              ? data.customerInfo.receivedDate.toISOString()
              : new Date().toISOString(),
          },
          items: data.items.map((item) => ({
            productModel: item.productModel,
            deviceSn: item.deviceSn,
            faultDesc: item.faultDesc || "",
            accessories: item.accessories || "",
          })),
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "创建成功",
          description: `成功创建 ${result.data.count} 个工单`,
        });
        // 跳转到工单列表页
        setTimeout(() => {
          router.push("/repairs");
        }, 1500);
      } else {
        toast({
          title: "创建失败",
          description: result.message || "批量创建工单失败",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("批量创建工单失败:", error);
      toast({
        title: "创建失败",
        description: error?.message || "网络错误，请重试",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto py-8 px-6 space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/repairs")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">批量维修录入</h1>
            <p className="text-muted-foreground mt-1">
              一次填写客户信息，批量录入多台设备
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* 客户信息卡片 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>客户信息</CardTitle>
              <CardDescription>公共信息，将应用到所有工单</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerName">
                    客户名称 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="customerName"
                    {...register("customerInfo.name", { required: "客户名称为必填项" })}
                    placeholder="请输入客户名称"
                    className={cn(errors.customerInfo?.name && "border-destructive")}
                  />
                  {errors.customerInfo?.name && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.customerInfo.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="contact">
                    联系人 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contact"
                    {...register("customerInfo.contact", { required: "联系人为必填项" })}
                    placeholder="请输入联系人"
                    className={cn(errors.customerInfo?.contact && "border-destructive")}
                  />
                  {errors.customerInfo?.contact && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.customerInfo.contact.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="phone">
                    电话 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    {...register("customerInfo.phone", { required: "电话为必填项" })}
                    placeholder="请输入电话"
                    className={cn(errors.customerInfo?.phone && "border-destructive")}
                  />
                  {errors.customerInfo?.phone && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.customerInfo.phone.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="address">地址</Label>
                  <Input
                    id="address"
                    {...register("customerInfo.address")}
                    placeholder="请输入地址"
                  />
                </div>

                <div>
                  <Label htmlFor="receivedDate">接收日期</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="receivedDate"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !customerInfo.receivedDate && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {customerInfo.receivedDate ? (
                          format(customerInfo.receivedDate, "yyyy-MM-dd", { locale: zhCN })
                        ) : (
                          <span>选择日期</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customerInfo.receivedDate || undefined}
                        onSelect={(date) =>
                          setValue("customerInfo.receivedDate", date || new Date())
                        }
                        initialFocus
                        locale={zhCN}
                        captionLayout="dropdown"
                        fromYear={2010}
                        toYear={new Date().getFullYear() + 5}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 设备明细卡片 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>设备明细</CardTitle>
                  <CardDescription>批量录入设备信息，每行一个设备</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLastRow}
                    className="flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    复制上一行
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddRow}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    添加一行
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">序号</TableHead>
                      <TableHead>
                        设备型号 <span className="text-destructive">*</span>
                      </TableHead>
                      <TableHead>
                        序列号 <span className="text-destructive">*</span>
                      </TableHead>
                      <TableHead>故障描述</TableHead>
                      <TableHead>附件</TableHead>
                      <TableHead className="w-20">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <Input
                            {...register(`items.${index}.productModel`, {
                              required: "设备型号为必填项",
                            })}
                            placeholder="请输入设备型号"
                            className={cn(
                              errors.items?.[index]?.productModel && "border-destructive"
                            )}
                          />
                          {errors.items?.[index]?.productModel && (
                            <p className="text-xs text-destructive mt-1">
                              {errors.items[index]?.productModel?.message}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            {...register(`items.${index}.deviceSn`, {
                              required: "序列号为必填项",
                            })}
                            placeholder="支持扫码/输入"
                            className={cn(
                              errors.items?.[index]?.deviceSn && "border-destructive"
                            )}
                          />
                          {errors.items?.[index]?.deviceSn && (
                            <p className="text-xs text-destructive mt-1">
                              {errors.items[index]?.deviceSn?.message}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Textarea
                            {...register(`items.${index}.faultDesc`)}
                            placeholder="请输入故障描述"
                            className="min-h-[60px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            {...register(`items.${index}.accessories`)}
                            placeholder="附件信息"
                          />
                        </TableCell>
                        <TableCell>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-4 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/repairs")}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  批量创建工单 ({items.length} 个)
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
