# 工单详情页面路由重构

**执行时间**: 2026-02-26  
**重构目标**: 将工单详情从全屏 Dialog 改为独立的页面路由

---

## 🎯 重构原因

### 用户反馈
"你别做成弹窗了吧直接做成一个页面"

### 问题分析
- 之前在 `repairs-panel.tsx` 中点击工单时，使用全屏 Dialog 显示详情
- 虽然是全屏的，但仍然是 Dialog 模式，有以下缺点：
  - ❌ 无法通过 URL 直接访问特定工单
  - ❌ 无法使用浏览器的前进/后退按钮
  - ❌ 无法分享工单链接
  - ❌ Dialog 有额外的 DOM 层级和性能开销

### 解决方案
- ✅ 创建独立的页面路由：`/repairs/detail/[id]`
- ✅ 修改 `repairs-panel.tsx`，点击工单时使用 `router.push()` 跳转
- ✅ 移除全屏 Dialog 相关代码

---

## 📝 修改内容

### 1. 创建新的路由页面

**文件**: `app/repairs/detail/[id]/page.tsx`

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import RepairDetailWrapper from '@/components/repair-detail-wrapper';

export default function RepairDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const handleBack = () => {
    // 返回到维修工单列表页面
    router.back();
  };

  return (
    <RepairDetailWrapper taskId={taskId} onBack={handleBack} />
  );
}
```

**说明**:
- ✅ 使用 `router.back()` 返回上一页，支持多种入口
- ✅ 复用 `RepairDetailWrapper` 组件，保持一致性

---

### 2. 修改 `repairs-panel.tsx`

#### 2.1 移除不必要的 import

**修改前**:
```tsx
import RepairDetailWrapper from "@/components/repair-detail-wrapper";
```

**修改后**:
```tsx
// 移除，不再需要在 panel 中直接使用
```

#### 2.2 移除 selectedRepairId 状态

**修改前**:
```tsx
const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null);
```

**修改后**:
```tsx
// 移除，改用路由跳转
```

#### 2.3 修改点击逻辑

**修改前**:
```tsx
<Card
  key={repair.id}
  className="hover:shadow-md transition-shadow cursor-pointer"
  onClick={() => setSelectedRepairId(repair.id)}
>
```

**修改后**:
```tsx
<Card
  key={repair.id}
  className="hover:shadow-md transition-shadow cursor-pointer"
  onClick={() => router.push(`/repairs/detail/${repair.id}`)}
>
```

#### 2.4 移除全屏 Dialog

**修改前**:
```tsx
{/* 工单详情全屏对话框 */}
{selectedRepairId && (
  <Dialog open={!!selectedRepairId} onOpenChange={(open) => !open && setSelectedRepairId(null)}>
    <DialogContent className="max-w-full w-screen h-screen p-0 gap-0 bg-background">
      <DialogHeader className="sr-only">
        <DialogTitle>工单详情</DialogTitle>
      </DialogHeader>
      <div className="h-full overflow-y-auto">
        <RepairDetailWrapper
          taskId={selectedRepairId}
          onBack={() => setSelectedRepairId(null)}
        />
      </div>
    </DialogContent>
  </Dialog>
)}
```

**修改后**:
```tsx
// 完全移除，改用页面路由
```

---

## ✅ 重构效果

### 用户体验提升

| 特性 | 重构前（Dialog） | 重构后（Page） |
|------|------------------|----------------|
| **URL 地址** | 不变（停留在列表页） | ✅ 变为 `/repairs/detail/[id]` |
| **浏览器前进/后退** | ❌ 无法使用 | ✅ 完全支持 |
| **分享链接** | ❌ 无法分享 | ✅ 可以直接分享 |
| **刷新页面** | ❌ 返回列表页 | ✅ 保持在详情页 |
| **浏览器书签** | ❌ 只能收藏列表页 | ✅ 可以收藏工单详情 |
| **性能** | Dialog 有额外 DOM 层级 | ✅ 标准页面渲染，更轻量 |

### 开发者体验提升

- ✅ **代码更简洁**: 移除了 Dialog 相关的状态管理和渲染逻辑
- ✅ **路由标准化**: 所有工单详情都通过统一的路由访问
- ✅ **调试更方便**: 可以直接在 URL 中修改工单 ID 进行测试
- ✅ **SEO 友好**: 如果未来需要 SEO，页面路由更有利

---

## 🔍 其他使用场景

### 现有的工单详情路由

1. **`/report/detail/[id]`** - 现场人员查看自己的报修工单
   - 使用 `router.push('/report')` 返回

2. **`/repairs/detail/[id]`** (新增) - 维修人员查看工单
   - 使用 `router.back()` 返回，支持多种入口

### 统一性说明

两个路由都使用 `RepairDetailWrapper` 组件，保证了：
- ✅ UI 一致性
- ✅ 逻辑一致性
- ✅ 维护性

---

## 🧪 测试清单

### 功能测试
- [x] 点击工单卡片能正确跳转到详情页
- [x] URL 地址正确显示工单 ID
- [x] 点击"返回"按钮能返回到上一页
- [x] 浏览器前进/后退按钮正常工作
- [x] 刷新页面后仍停留在详情页
- [x] 直接访问 `/repairs/detail/[id]` 能正确显示工单

### 边界测试
- [x] 访问不存在的工单 ID 有合适的错误处理
- [x] 从不同页面（列表、搜索、筛选）进入详情页都能正确返回
- [x] 工单详情页的所有功能正常（编辑、保存、状态流转等）

---

## 📊 代码变化统计

### 新增文件
- ✅ `app/repairs/detail/[id]/page.tsx` (18 行)

### 修改文件
- ✅ `components/repairs-panel.tsx`
  - 移除 1 个 import
  - 移除 1 个 state 变量
  - 修改 1 处点击处理逻辑
  - 移除 1 个全屏 Dialog (约 15 行)
  - **净减少**: ~13 行代码

### 总计
- **新增**: 18 行
- **删除**: 13 行
- **净增加**: 5 行

---

## 🚀 未来优化建议

### 1. 路由参数
可以在 URL 中添加更多参数，例如：
```
/repairs/detail/[id]?tab=workbench&section=photos
```

### 2. 路由保护
添加权限检查，确保用户只能访问自己有权限的工单：
```tsx
// 在 page.tsx 中添加权限检查
if (!hasPermission(user, taskId)) {
  router.push('/unauthorized');
}
```

### 3. 预加载
在列表页鼠标悬停时预加载工单数据：
```tsx
<Card
  onMouseEnter={() => router.prefetch(`/repairs/detail/${repair.id}`)}
>
```

### 4. 面包屑导航
添加面包屑，让用户清楚当前位置：
```
首页 > 维修工单 > 工单详情 > WX20260226001
```

---

## 📝 总结

### 重构成果
- ✅ 将全屏 Dialog 改为标准页面路由
- ✅ 提升用户体验（URL、浏览器导航、分享等）
- ✅ 简化代码逻辑，移除不必要的状态管理
- ✅ 保持 UI/UX 一致性

### 用户价值
- 🔗 **可分享**: 可以直接分享工单链接给同事
- 🔄 **可导航**: 浏览器前进/后退按钮正常工作
- 📌 **可收藏**: 可以将常用工单添加到浏览器书签
- 🚀 **更流畅**: 标准页面路由，性能更好

---

**文档版本**: v1.0  
**最后更新**: 2026-02-26  
**维护者**: AI Assistant
