"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

// 维修工单类型定义
export interface RepairTicket {
  id: string;
  deviceId: number;
  deviceName: string;
  deviceModel: string;
  problem: string;
  status: "created" | "in_repair" | "admin_review" | "pending_shipment" | "completed" | "cancelled" | "unrepairable" | "delayed" | "pending" | "processing"; // 支持新旧状态
  priority: "low" | "medium" | "high" | "critical";
  location: string;
  reportedBy: string;
  reportedAt: string;
  assignedTo?: string;
  completedAt?: string;
  notes?: string;
  deviceSerialNumber?: string;
  productSN?: string; // ProductSN 字段，用于判断是否需要补录
  expectedCompletionDate?: string | Date;
  expressCompany?: string;
  trackingNumber?: string;
  devicePhotos?: string[];
  damagePhotos?: string[];
  inWarranty?: boolean;
  warrantyEnd?: string;
}

// 创建Context
interface RepairContextType {
  repairs: RepairTicket[];
  loading: boolean;
  error: string | null;
  refreshRepairs: () => Promise<void>;
  addRepair: (newRepair: Omit<RepairTicket, "id" | "reportedAt">) => void;
  updateRepair: (id: string, updates: Partial<RepairTicket>) => void;
  deleteRepair: (id: string) => void;
  getRepairById: (id: string) => RepairTicket | undefined;
  getRepairsByStatus: (status: RepairTicket["status"]) => RepairTicket[];
  getRepairsByDevice: (deviceId: number) => RepairTicket[];
}

const RepairContext = createContext<RepairContextType | undefined>(undefined);

// Provider组件
export function RepairProvider({ children }: { children: ReactNode }) {
  const [repairs, setRepairs] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 从 API 加载工单数据
  const refreshRepairs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tickets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // 先尝试解析响应
      let result: any = {};
      let responseText = '';
      try {
        responseText = await response.text();
        if (responseText && responseText.trim()) {
          result = JSON.parse(responseText);
        } else {
          // 如果响应为空，创建一个错误对象
          result = {
            success: false,
            message: '服务器返回了空响应',
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
      } catch (parseError) {
        console.error('解析响应失败:', parseError, '响应内容:', responseText);
        throw new Error(`服务器返回了无效的响应: ${responseText.substring(0, 200)}`);
      }
      
      if (!response.ok) {
        const errorMessage = result?.message || result?.error || `获取工单列表失败 (HTTP ${response.status})`;
        console.error('API 错误响应:', { 
          status: response.status, 
          statusText: response.statusText,
          result,
          responseText: responseText.substring(0, 500)
        });
        throw new Error(errorMessage);
      }
      
      if (!result.success) {
        const errorMessage = result?.message || result?.error || '获取工单列表失败';
        console.error('API 业务错误:', result);
        throw new Error(errorMessage);
      }
      
      if (result.data && Array.isArray(result.data)) {
        // 转换为前端需要的格式
        const formattedRepairs: RepairTicket[] = result.data
          .map((ticket: any) => {
            const dbStatus = (ticket.status || "Created").toLowerCase();

            // 已删除的工单（回收站）不出现在正常列表里
            if (dbStatus === "deleted") {
              return null;
            }

            // 状态映射：支持新状态和旧状态（向后兼容）
            // 保留新状态的原始值，以便在详情页正确显示
            const mappedStatus =
              dbStatus === "created" || dbStatus === "pending" // 待维修/待处理
                ? "created"
                : dbStatus === "in_repair" || dbStatus === "processing" // 维修中
                ? "in_repair"
                : dbStatus === "admin_review" // 待商务处理
                ? "admin_review"
                : dbStatus === "pending_shipment" // 待发货
                ? "pending_shipment"
                : dbStatus === "completed"
                ? "completed"
                : dbStatus === "unrepairable"
                ? "unrepairable"
                : dbStatus === "delayed"
                ? "delayed"
                : "created"; // 默认

            return {
              id: ticket.id || "",
              deviceId: ticket.deviceSerialNumber
                ? parseInt(ticket.deviceSerialNumber.slice(-6), 36) || 0
                : 0,
              deviceName: ticket.deviceName || ticket.deviceModel || "",
              deviceModel: ticket.deviceModel || "",
              problem: ticket.problem || "",
              status: mappedStatus,
              priority: "medium" as const,
              location: ticket.projectLocation || "",
              reportedBy: ticket.reportedBy || "",
              reportedAt: ticket.reportedAt || new Date().toISOString(),
              deviceSerialNumber: ticket.deviceSerialNumber || "",
              productSN: ticket.productSN || ticket.deviceSerialNumber || "", // ProductSN 字段
              expressCompany: ticket.courierCompany || "",
              trackingNumber: ticket.trackingNumber || "",
              expectedCompletionDate: ticket.expectedCompletionDate || undefined,
              devicePhotos: [],
              damagePhotos: [],
            };
          })
          .filter((item): item is RepairTicket => item !== null);

        setRepairs(formattedRepairs);
      } else {
        // 如果没有数据，设置为空数组
        console.warn('API 返回的数据格式不正确:', result);
        setRepairs([]);
      }
    } catch (err: any) {
      console.error('加载工单失败:', err);
      const errorMessage = err?.message || '加载工单失败，请检查网络连接或联系管理员';
      setError(errorMessage);
      // 即使失败也设置为空数组，避免显示旧数据
      setRepairs([]);
    } finally {
      setLoading(false);
    }
  };

  // 组件加载时自动刷新（只在客户端执行）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      refreshRepairs();
    }
  }, []);

  // 添加新工单（仅用于前端临时显示，实际数据已保存到数据库）
  const addRepair = (newRepair: Omit<RepairTicket, "id" | "reportedAt">) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const newTicket: RepairTicket = {
      ...newRepair,
      id: `R-${now.getFullYear()}-${String(repairs.length + 1).padStart(3, '0')}`,
      reportedAt: formattedDate
    };
    
    // 添加到列表并刷新（从数据库重新加载）
    setRepairs(prevRepairs => [...prevRepairs, newTicket]);
    // 延迟刷新，确保数据库已保存
    setTimeout(() => {
      refreshRepairs();
    }, 500);
  };

  // 更新工单（同步到数据库）
  const updateRepair = async (id: string, updates: Partial<RepairTicket>) => {
    try {
      // 调用 API 更新工单
      const statusMap: Record<string, string> = {
        "pending": "Pending",
        "processing": "Processing",
        "completed": "Completed",
        "unrepairable": "Unrepairable"
      };
      
      if (updates.status) {
        const dbStatus = statusMap[updates.status] || updates.status;
        const response = await fetch(`/api/tickets/${id}/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: dbStatus }),
        });
        
        if (response.ok) {
          // 更新本地状态
          setRepairs(prevRepairs => 
            prevRepairs.map(repair => 
              repair.id === id ? { ...repair, ...updates } : repair
            )
          );
          // 刷新数据
          await refreshRepairs();
        }
      } else {
        // 其他更新直接更新本地状态（如果不需要同步到数据库）
        setRepairs(prevRepairs => 
          prevRepairs.map(repair => 
            repair.id === id ? { ...repair, ...updates } : repair
          )
        );
      }
    } catch (err: any) {
      console.error('更新工单失败:', err);
    }
  };

  // 删除工单（如果需要，可以调用 API）
  const deleteRepair = (id: string) => {
    setRepairs(prevRepairs => prevRepairs.filter(repair => repair.id !== id));
    // 如果需要从数据库删除，可以调用 API
  };

  // 根据ID获取工单
  const getRepairById = (id: string) => {
    return repairs.find(repair => repair.id === id);
  };

  // 根据状态获取工单
  const getRepairsByStatus = (status: RepairTicket["status"]) => {
    return repairs.filter(repair => repair.status === status);
  };

  // 根据设备ID获取工单
  const getRepairsByDevice = (deviceId: number) => {
    return repairs.filter(repair => repair.deviceId === deviceId);
  };

  return (
    <RepairContext.Provider value={{
      repairs,
      loading,
      error,
      refreshRepairs,
      addRepair,
      updateRepair,
      deleteRepair,
      getRepairById,
      getRepairsByStatus,
      getRepairsByDevice
    }}>
      {children}
    </RepairContext.Provider>
  );
}

// 自定义Hook，方便在组件中使用Context
export function useRepairContext() {
  const context = useContext(RepairContext);
  if (context === undefined) {
    throw new Error("useRepairContext must be used within a RepairProvider");
  }
  return context;
}
