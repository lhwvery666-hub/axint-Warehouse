"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

// 通知类型定义
export interface Notification {
  id: string;
  type: "repair_started" | "repair_completed" | "repair_unrepairable" | "repair_delayed" | "system"; // 维修开始、维修完成、无法维修、已延期、系统通知
  title: string;
  message: string;
  repairId?: string; // 关联的维修工单ID
  deviceName?: string; // 设备名称
  deviceModel?: string; // 设备型号
  status?: string; // 工单状态
  createdAt: string; // 创建时间
  read: boolean; // 是否已读
  recipient: string; // 接收人（现场报告人员的实名）
}

// NotificationContext 类型
interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  getNotificationsByRecipient: (recipient: string) => Notification[];
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Provider组件
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  // 从 API 加载通知数据（如果需要，可以创建 /api/notifications 端点）
  const refreshNotifications = async () => {
    setLoading(true);
    try {
      // TODO: 如果后端有通知 API，可以在这里调用
      // const response = await fetch('/api/notifications');
      // if (response.ok) {
      //   const result = await response.json();
      //   if (result.success && result.data) {
      //     setNotifications(result.data);
      //   }
      // }
    } catch (error) {
      console.error('加载通知失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 组件加载时刷新通知
  useEffect(() => {
    refreshNotifications();
  }, []);

  // 计算未读数量
  const unreadCount = notifications.filter(n => !n.read).length;

  // 添加通知（临时存储在内存中，不持久化）
  const addNotification = (notification: Omit<Notification, "id" | "createdAt" | "read">) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: formattedDate,
      read: false
    };
    
    setNotifications(prev => [newNotification, ...prev]);
    
    // TODO: 如果后端有通知 API，可以在这里保存到数据库
    // fetch('/api/notifications', { method: 'POST', body: JSON.stringify(newNotification) })
  };

  // 标记为已读
  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
    
    // TODO: 如果后端有通知 API，可以在这里更新数据库
    // fetch(`/api/notifications/${id}`, { method: 'PUT', body: JSON.stringify({ read: true }) })
  };

  // 标记全部为已读
  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(notif => ({ ...notif, read: true }))
    );
    
    // TODO: 如果后端有通知 API，可以在这里批量更新数据库
  };

  // 删除通知
  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
    
    // TODO: 如果后端有通知 API，可以在这里从数据库删除
    // fetch(`/api/notifications/${id}`, { method: 'DELETE' })
  };

  // 清除所有通知
  const clearAllNotifications = () => {
    setNotifications([]);
    
    // TODO: 如果后端有通知 API，可以在这里清除数据库中的通知
  };

  // 根据接收人获取通知
  const getNotificationsByRecipient = (recipient: string) => {
    return notifications.filter(notif => notif.recipient === recipient);
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      loading,
      refreshNotifications,
      addNotification,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAllNotifications,
      getNotificationsByRecipient
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

// 自定义Hook
export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotificationContext must be used within a NotificationProvider");
  }
  return context;
}
