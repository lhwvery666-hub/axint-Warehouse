# 硬编码重构示例

## 🎯 目标
将所有硬编码的角色、状态、权限等替换为配置驱动的动态系统。

## 📋 重构前后对比

### 1. 角色判断重构

#### ❌ 重构前（硬编码）
```typescript
// 在组件中硬编码角色判断
{user?.role === "admin" && (
  <Button>管理员操作</Button>
)}

{user?.role === "technician" && (
  <Button>维修操作</Button>
)}

// 在API中硬编码权限检查
const role = (userData.Role || "").toString().toLowerCase()
if (role === "technician") {
  // 维修人员逻辑
}
```

#### ✅ 重构后（配置驱动）
```typescript
// 使用RoleGuard组件
import { AdminGuard, TechnicianGuard } from '@/components/role-guard';

<AdminGuard user={user}>
  <Button>管理员操作</Button>
</AdminGuard>

<TechnicianGuard user={user}>
  <Button>维修操作</Button>
</TechnicianGuard>

// 使用权限检查
import { useUserRole } from '@/hooks/use-system-config';

const { hasPermission } = useUserRole(user);
if (await hasPermission('repair.edit')) {
  // 有权限的逻辑
}
```

### 2. 状态显示重构

#### ❌ 重构前（硬编码）
```typescript
// 硬编码状态判断和颜色
if (status === "cancelled" || status === "Cancelled") {
  return <Badge variant="destructive">已取消</Badge>;
}

if (status === "in_repair" || status === "In_Repair") {
  return <Badge className="bg-blue-600">维修中</Badge>;
}

// 硬编码状态流转
const nextStatuses = {
  'pending': ['in_repair', 'cancelled'],
  'in_repair': ['completed', 'unrepairable']
};
```

#### ✅ 重构后（配置驱动）
```typescript
// 使用StatusBadge组件
import { StatusBadge } from '@/components/status-badge';

<StatusBadge status={status} userRole={user.role} />

// 使用状态选择器
import { StatusSelector } from '@/components/status-badge';

<StatusSelector 
  currentStatus={status} 
  userRole={user.role}
  onStatusChange={handleStatusChange}
/>

// 配置驱动的状态流转
import { getNextStatuses } from '@/lib/system-config';

const nextStatuses = await getNextStatuses(currentStatus);
```

### 3. 路由跳转重构

#### ❌ 重构前（硬编码）
```typescript
// 硬编码路由跳转
if (user?.role === "admin") {
  router.push("/admin/users");
} else if (user?.role === "business") {
  router.push("/business/dashboard");
} else if (user?.role === "warehouse") {
  router.push("/warehouse/dashboard");
}
```

#### ✅ 重构后（配置驱动）
```typescript
// 使用配置驱动的默认路由
import { useUserRole } from '@/hooks/use-system-config';

const { defaultRoute } = useUserRole(user);
router.push(defaultRoute);

// 或者使用权限检查
import { canAccessRoute } from '@/lib/system-config';

if (await canAccessRoute(user.role, "/admin/users")) {
  router.push("/admin/users");
}
```

### 4. 公司信息重构

#### ❌ 重构前（硬编码）
```typescript
// 硬编码公司信息
const companyName = "深圳市爱克信智能股份有限公司";
const companyPhone = "13530978726";
const companyAddress = "深圳市宝安区石岩街道办民生三路料坑嘉一达工业园6栋2楼";
```

#### ✅ 重构后（配置驱动）
```typescript
// 使用配置获取公司信息
import { getCompanyInfo } from '@/lib/system-config';

const companyInfo = await getCompanyInfo();
// companyInfo.name, companyInfo.phone, companyInfo.address

// 或使用Hook
import { useCompanyInfo } from '@/hooks/use-system-config';

const { companyInfo } = useCompanyInfo();
```

### 5. 业务规则重构

#### ❌ 重构前（硬编码）
```typescript
// 硬编码业务规则
const warrantyPeriod = 12; // 12个月保修期
const requireSignature = true; // 需要签字
const splitBySerial = true; // 按序列号分行
```

#### ✅ 重构后（配置驱动）
```typescript
// 使用配置获取业务规则
import { getBusinessConfig } from '@/lib/system-config';

const businessConfig = await getBusinessConfig();
const warrantyPeriod = businessConfig.warrantyPeriodMonths;
const requireSignature = businessConfig.reportRequireSignature;
const splitBySerial = businessConfig.exportSplitBySerial;
```

## 🔧 具体重构步骤

### 步骤1：安装配置系统
```bash
# 创建完整配置表
npm run create-complete-config

# 或手动运行
npx tsx scripts/create-complete-config-table.ts
```

### 步骤2：替换角色判断
```typescript
// 1. 导入RoleGuard组件
import { AdminGuard, TechnicianGuard, ReporterGuard } from '@/components/role-guard';

// 2. 替换硬编码判断
// 旧代码：
{user?.role === "admin" && <Component />}

// 新代码：
<AdminGuard user={user}><Component /></AdminGuard>
```

### 步骤3：替换状态显示
```typescript
// 1. 导入StatusBadge组件
import { StatusBadge } from '@/components/status-badge';

// 2. 替换硬编码状态
// 旧代码：
if (status === "cancelled") return <Badge>已取消</Badge>;

// 新代码：
<StatusBadge status={status} userRole={user.role} />
```

### 步骤4：替换路由跳转
```typescript
// 1. 导入useUserRole Hook
import { useUserRole } from '@/hooks/use-system-config';

// 2. 使用配置驱动路由
const { defaultRoute } = useUserRole(user);
router.push(defaultRoute);
```

### 步骤5：替换公司信息
```typescript
// 1. 导入useCompanyInfo Hook
import { useCompanyInfo } from '@/hooks/use-system-config';

// 2. 使用配置公司信息
const { companyInfo } = useCompanyInfo();
```

## 📋 重构检查清单

### 组件重构
- [ ] `components/repair-detail.tsx` - 替换所有角色和状态硬编码
- [ ] `components/dashboard.tsx` - 替换角色判断
- [ ] `components/repair-page.tsx` - 替换状态筛选
- [ ] `components/repair-form.tsx` - 替换业务规则硬编码

### API重构
- [ ] `app/api/tickets/[id]/update/route.ts` - 替换权限检查
- [ ] `app/api/tickets/[id]/route.ts` - 替换状态验证
- [ ] `app/api/auth/login/route.ts` - 替换角色映射

### 页面重构
- [ ] `app/page.tsx` - 替换路由跳转逻辑
- [ ] `app/business/page.tsx` - 替换状态筛选
- [ ] `app/business/layout.tsx` - 替换权限检查

### 工具重构
- [ ] `context/auth-context.tsx` - 替换角色和路由配置
- [ ] `lib/workflow-utils.ts` - 替换状态定义和流转

## 🎯 重构后的优势

### 1. 完全可配置
- 所有角色、状态、权限都可以通过配置修改
- 无需修改代码即可调整业务逻辑

### 2. 易于维护
- 统一的配置管理
- 清晰的权限控制
- 类型安全的配置访问

### 3. 商用级别
- 支持多租户配置
- 动态权限管理
- 完整的配置缓存

### 4. 扩展性强
- 新增角色只需添加配置
- 新增状态只需添加配置
- 支持复杂的权限组合

## 🚀 下一步

1. **运行配置脚本**：创建完整的配置表
2. **逐步重构**：从核心组件开始替换硬编码
3. **测试验证**：确保所有功能正常工作
4. **配置界面**：开发管理员配置界面
5. **文档完善**：更新使用文档

这样你的系统就完全达到了商用级别的标准！🎉
