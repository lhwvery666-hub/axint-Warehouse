/**
 * 状态徽章组件
 * 根据配置动态显示状态，替换硬编码
 */

import { Badge } from '@/components/ui/badge';
import { useStatusManager } from '@/hooks/use-system-config';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  userRole: string;
  className?: string;
  showIcon?: boolean;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

/**
 * 状态徽章组件
 * 根据配置动态显示颜色、图标和文本
 */
export function StatusBadge({ 
  status, 
  userRole, 
  className, 
  showIcon = true,
  variant = 'default'
}: StatusBadgeProps) {
  const { 
    getStatusColor, 
    getStatusIcon, 
    canViewStatus 
  } = useStatusManager(userRole);

  // 检查用户是否可以查看此状态
  if (!canViewStatus(status)) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)}>
        无权限查看
      </Badge>
    );
  }

  const color = getStatusColor(status);
  const icon = getStatusIcon(status);

  // 根据颜色确定徽章样式
  const getVariantClass = () => {
    switch (variant) {
      case 'default':
        return '';
      case 'secondary':
        return 'bg-secondary text-secondary-foreground';
      case 'destructive':
        return 'bg-destructive text-destructive-foreground';
      case 'outline':
        return 'border border-input bg-background hover:bg-accent hover:text-accent-foreground';
      default:
        return '';
    }
  };

  return (
    <Badge 
      variant={variant}
      className={cn(
        "flex items-center gap-1",
        getVariantClass(),
        variant === 'default' && "text-white",
        className
      )}
      style={variant === 'default' ? { backgroundColor: color } : undefined}
    >
      {showIcon && icon && (
        <span className="text-xs">{getIconElement(icon)}</span>
      )}
      <span>{getStatusText(status)}</span>
    </Badge>
  );
}

/**
 * 状态选择器组件
 */
interface StatusSelectorProps {
  currentStatus: string;
  userRole: string;
  onStatusChange: (newStatus: string) => void;
  className?: string;
}

export function StatusSelector({ 
  currentStatus, 
  userRole, 
  onStatusChange, 
  className 
}: StatusSelectorProps) {
  const { getNextStatuses, canEditStatus, getStatusColor, getStatusIcon } = useStatusManager(userRole);

  // 检查用户是否可以编辑当前状态
  if (!canEditStatus(currentStatus)) {
    return (
      <StatusBadge status={currentStatus} userRole={userRole} className={className} />
    );
  }

  const nextStatuses = getNextStatuses(currentStatus);

  if (nextStatuses.length === 0) {
    return (
      <StatusBadge status={currentStatus} userRole={userRole} className={className} />
    );
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <StatusBadge status={currentStatus} userRole={userRole} />
      {nextStatuses.map(nextStatus => (
        <button
          key={nextStatus}
          onClick={() => onStatusChange(nextStatus)}
          className="px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
          style={{ borderColor: getStatusColor(nextStatus) }}
        >
          <span className="mr-1">{getIconElement(getStatusIcon(nextStatus))}</span>
          {getStatusText(nextStatus)}
        </button>
      ))}
    </div>
  );
}

/**
 * 状态列表组件
 */
interface StatusListProps {
  userRole: string;
  filterCategory?: string;
  className?: string;
}

export function StatusList({ userRole, filterCategory, className }: StatusListProps) {
  const { statuses, canViewStatus } = useStatusManager(userRole);

  const filteredStatuses = filterCategory 
    ? statuses.filter(status => status.category === filterCategory)
    : statuses;

  return (
    <div className={cn("space-y-2", className)}>
      {filteredStatuses
        .filter(status => canViewStatus(status.id))
        .map(status => (
          <div key={status.id} className="flex items-center justify-between p-2 border rounded">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: status.color }}
              />
              <span className="font-medium">{status.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{status.id}</span>
              {getIconElement(status.icon)}
            </div>
          </div>
        ))}
    </div>
  );
}

// ==================== 工具函数 ====================

/**
 * 获取状态文本
 */
function getStatusText(statusId: string): string {
  const statusTexts: Record<string, string> = {
    'created': '已创建',
    'pending': '待处理',
    'in_repair': '维修中',
    'processing': '处理中',
    'completed': '已完成',
    'cancelled': '已取消',
    'unrepairable': '无法维修',
    'return_unrepaired': '拒修退回',
    'scrapped': '已报废',
    'deleted': '已删除'
  };

  return statusTexts[statusId] || statusId;
}

/**
 * 获取图标元素
 */
function getIconElement(iconName: string): string {
  const iconMap: Record<string, string> = {
    'clock': '🕐',
    'wrench': '🔧',
    'check-circle': '✅',
    'x-circle': '❌',
    'alert-circle': '⚠️',
    'package': '📦',
    'file-text': '📄',
    'shield': '🛡️',
    'briefcase': '💼',
    'user': '👤',
    'circle': '⚪'
  };

  return iconMap[iconName] || '⚪';
}

/**
 * 状态颜色工具函数
 */
export function getStatusColor(statusId: string): string {
  const colorMap: Record<string, string> = {
    'created': '#6b7280',
    'pending': '#f59e0b',
    'in_repair': '#3b82f6',
    'processing': '#3b82f6',
    'completed': '#10b981',
    'cancelled': '#6b7280',
    'unrepairable': '#ef4444',
    'return_unrepaired': '#f97316',
    'scrapped': '#7c3aed',
    'deleted': '#6b7280'
  };

  return colorMap[statusId] || '#6b7280';
}
