/**
 * 系统配置Hook
 * 提供角色、状态、权限等配置的React Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  getAllRoles, 
  getAllStatuses, 
  getRole, 
  getStatus, 
  hasPermission,
  canAccessRoute,
  canViewStatus,
  canEditStatus,
  getNextStatuses,
  getCompanyInfo,
  getBusinessConfig,
  getDefaultRoute
} from '@/lib/system-config';

// ==================== 基础配置Hook ====================

export function useSystemConfig() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/system-config');
      const result = await response.json();
      
      if (result.success) {
        setConfigs(result.data);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  return { configs, loading, error, reload: loadConfigs };
}

// ==================== 角色配置Hook ====================

export function useRoles() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/system-config?type=roles');
      const result = await response.json();
      
      if (result.success) {
        setRoles(result.data);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('加载角色配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const getRoleById = useCallback((roleId: string) => {
    return roles.find(role => role.id === roleId);
  }, [roles]);

  return { roles, loading, error, reload: loadRoles, getRoleById };
}

// ==================== 状态配置Hook ====================

export function useStatuses() {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/system-config?type=status');
      const result = await response.json();
      
      if (result.success) {
        setStatuses(result.data);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('加载状态配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const getStatusById = useCallback((statusId: string) => {
    return statuses.find(status => status.id === statusId);
  }, [statuses]);

  return { statuses, loading, error, reload: loadStatuses, getStatusById };
}

// ==================== 权限检查Hook ====================

export function usePermissions(userRole: string) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        setLoading(true);
        const role = await getRole(userRole);
        setPermissions(role?.permissions || []);
      } catch (err) {
        console.error('加载权限失败:', err);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    if (userRole) {
      loadPermissions();
    }
  }, [userRole]);

  const checkPermission = useCallback(async (permission: string) => {
    return await hasPermission(userRole, permission);
  }, [userRole]);

  const checkRouteAccess = useCallback(async (route: string) => {
    return await canAccessRoute(userRole, route);
  }, [userRole]);

  return {
    permissions,
    loading,
    checkPermission,
    checkRouteAccess
  };
}

// ==================== 公司信息Hook ====================

export function useCompanyInfo() {
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadCompanyInfo = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/system-config?type=company');
      const result = await response.json();
      
      if (result.success) {
        setCompanyInfo(result.data);
      }
    } catch (err) {
      console.error('加载公司信息失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanyInfo();
  }, [loadCompanyInfo]);

  return { companyInfo, loading, reload: loadCompanyInfo };
}

// ==================== 业务配置Hook ====================

export function useBusinessConfig() {
  const [businessConfig, setBusinessConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadBusinessConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/system-config?type=business');
      const result = await response.json();
      
      if (result.success) {
        setBusinessConfig(result.data);
      }
    } catch (err) {
      console.error('加载业务配置失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBusinessConfig();
  }, [loadBusinessConfig]);

  return { businessConfig, loading, reload: loadBusinessConfig };
}

// ==================== 用户角色Hook ====================

export function useUserRole(user: any) {
  const [roleConfig, setRoleConfig] = useState<any>(null);
  const [defaultRoute, setDefaultRoute] = useState<string>('/');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRoleConfig = async () => {
      if (!user?.role) return;

      try {
        setLoading(true);
        
        // 获取角色配置
        const role = await getRole(user.role);
        setRoleConfig(role);

        // 获取默认路由
        const route = await getDefaultRoute(user.role);
        setDefaultRoute(route);
        
      } catch (err) {
        console.error('加载用户角色配置失败:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRoleConfig();
  }, [user]);

  const hasPermission = useCallback(async (permission: string) => {
    if (!roleConfig) return false;
    return roleConfig.permissions.includes('all') || roleConfig.permissions.includes(permission);
  }, [roleConfig]);

  const canAccessRoute = useCallback((route: string) => {
    if (!roleConfig) return false;
    return roleConfig.routes.includes('/admin') || // 管理员可以访问所有路由
               roleConfig.routes.includes(route) ||
               roleConfig.routes.some(r => route.startsWith(r));
  }, [roleConfig]);

  return {
    roleConfig,
    defaultRoute,
    loading,
    hasPermission,
    canAccessRoute
  };
}

// ==================== 状态管理Hook ====================

export function useStatusManager(userRole: string) {
  const { statuses } = useStatuses();

  const canViewStatus = useCallback((statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.rolesCanView.includes(userRole) || false;
  }, [statuses, userRole]);

  const canEditStatus = useCallback((statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.rolesCanEdit.includes(userRole) || false;
  }, [statuses, userRole]);

  const getNextStatuses = useCallback((currentStatusId: string) => {
    const status = statuses.find(s => s.id === currentStatusId);
    return status?.nextStatuses || [];
  }, [statuses]);

  const getStatusColor = useCallback((statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.color || '#6b7280';
  }, [statuses]);

  const getStatusIcon = useCallback((statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.icon || 'circle';
  }, [statuses]);

  return {
    statuses,
    canViewStatus,
    canEditStatus,
    getNextStatuses,
    getStatusColor,
    getStatusIcon
  };
}
