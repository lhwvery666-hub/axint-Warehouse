/**
 * 角色权限守卫组件
 * 根据用户角色和权限控制组件显示
 */

import { ReactNode } from 'react';
import { useUserRole } from '@/hooks/use-system-config';

interface RoleGuardProps {
  children: ReactNode;
  roles?: string[];
  permissions?: string[];
  requireAll?: boolean; // 是否需要满足所有条件
  fallback?: ReactNode;
  user?: any;
}

/**
 * 角色守卫组件
 * 只有符合角色或权限要求的用户才能看到子组件
 */
export function RoleGuard({ 
  children, 
  roles = [], 
  permissions = [], 
  requireAll = false,
  fallback = null,
  user 
}: RoleGuardProps) {
  const { roleConfig, loading } = useUserRole(user);

  // 加载中显示fallback或null
  if (loading) {
    return <>{fallback}</>;
  }

  // 没有用户信息或角色配置
  if (!user?.role || !roleConfig) {
    return <>{fallback}</>;
  }

  // 检查角色权限
  const hasRole = roles.length === 0 || roles.includes(user.role);
  
  // 检查功能权限
  const hasPermission = permissions.length === 0 || 
    permissions.some(permission => 
      roleConfig.permissions.includes('all') || 
      roleConfig.permissions.includes(permission)
    );

  // 判断是否显示
  const shouldShow = requireAll 
    ? hasRole && hasPermission
    : hasRole || hasPermission;

  return shouldShow ? <>{children}</> : <>{fallback}</>;
}

/**
 * 管理员权限组件
 */
export function AdminGuard({ children, fallback = null, user }: { children: ReactNode; fallback?: ReactNode; user?: any }) {
  return (
    <RoleGuard roles={['admin']} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}

/**
 * 维修工程师权限组件
 */
export function TechnicianGuard({ children, fallback = null, user }: { children: ReactNode; fallback?: ReactNode; user?: any }) {
  return (
    <RoleGuard roles={['technician']} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}

/**
 * 现场报告人员权限组件
 */
export function ReporterGuard({ children, fallback = null, user }: { children: ReactNode; fallback?: ReactNode; user?: any }) {
  return (
    <RoleGuard roles={['reporter']} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}

/**
 * 商务人员权限组件
 */
export function BusinessGuard({ children, fallback = null, user }: { children: ReactNode; fallback?: ReactNode; user?: any }) {
  return (
    <RoleGuard roles={['business']} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}

/**
 * 仓库管理员权限组件
 */
export function WarehouseGuard({ children, fallback = null, user }: { children: ReactNode; fallback?: ReactNode; user?: any }) {
  return (
    <RoleGuard roles={['warehouse']} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}

/**
 * 权限检查组件
 */
export function PermissionGuard({ 
  children, 
  permissions, 
  fallback = null, 
  user 
}: { 
  children: ReactNode; 
  permissions: string[]; 
  fallback?: ReactNode; 
  user?: any 
}) {
  return (
    <RoleGuard permissions={permissions} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}

/**
 * 任意角色匹配组件（满足任一角色即可）
 */
export function AnyRoleGuard({ 
  children, 
  roles, 
  fallback = null, 
  user 
}: { 
  children: ReactNode; 
  roles: string[]; 
  fallback?: ReactNode; 
  user?: any 
}) {
  return (
    <RoleGuard roles={roles} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}

/**
 * 所有角色匹配组件（需要满足所有角色）
 */
export function AllRolesGuard({ 
  children, 
  roles, 
  fallback = null, 
  user 
}: { 
  children: ReactNode; 
  roles: string[]; 
  fallback?: ReactNode; 
  user?: any 
}) {
  return (
    <RoleGuard roles={roles} requireAll={true} fallback={fallback} user={user}>
      {children}
    </RoleGuard>
  );
}
