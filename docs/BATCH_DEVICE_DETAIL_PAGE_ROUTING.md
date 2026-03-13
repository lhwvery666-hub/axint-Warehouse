# 批次工单中设备详情路由重构

**执行时间**: 2026-02-26  
**重构目标**: 将批次工单中的设备详情从全屏 Dialog 改为独立的页面路由

---

## 🎯 用户反馈

### 问题描述
用户在批次工单详情页面（`/batch/[id]`）中点击设备列表的"查看详情"按钮时，看到的是一个全屏 Dialog（第一张截图），但用户想要的是像单个工单详情那样的**完整独立页面**（第二张截图）。

### 用户原话
"这就是你说的页面？我要的是第二种图片那样的"

### 根本原因
在 `batch-work-order-detail.tsx` 中，点击设备详情时使用了全屏 Dialog：

```tsx
{/* 设备详情全屏弹窗 */}
{selectedDeviceId && (
  <Dialog open={!!selectedDeviceId} onOpenChange={(open) => !open && setSelectedDeviceId(null)}>
    <DialogContent className="max-w-full w-screen h-screen p-0 gap-0 bg-background">
      <div className="h-full overflow-y-auto">
        <RepairDetail taskId={selectedDeviceId} onBack={() => setSelectedDeviceId(null)} />
      </div>
    </DialogContent>
  </Dialog>
)}
```

虽然是全屏的，但仍然是 Dialog 模式，存在以下问题：
- ❌ URL 不会改变（停留在批次详情页）
- ❌ 无法使用浏览器前进/后退按钮
- ❌ 刷新页面会返回批次详情
- ❌ 无法分享设备详情链接
- ❌ Dialog 有额外的 DOM 层级

---

## 📝 修改内容

### 1. 移除 selectedDeviceId 状态

**修改前**:
```tsx
const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
```

**修改后**:
```tsx
// 移除，改用路由跳转
```

---

### 2. 移除不必要的 import

**修改前**:
```tsx
import RepairDetail from "@/components/repair-detail"
```

**修改后**:
```tsx
// 移除，不再在 batch-work-order-detail 中直接使用
```

---

### 3. 修改设备行的点击逻辑

**修改前**:
```tsx
<TableRow
  key={device.id}
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => setSelectedDeviceId(device.id)}
>
```

**修改后**:
```tsx
<TableRow
  key={device.id}
  className="hover:bg-muted/50"
>
```

**说明**: 移除整行点击，只保留"查看详情"按钮的点击

---

### 4. 修改"查看详情"按钮

**修改前**:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={(e) => {
    e.stopPropagation()
    setSelectedDeviceId(device.id)
  }}
>
  查看详情
</Button>
```

**修改后**:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => router.push(`/repairs/detail/${device.id}`)}
>
  查看详情
</Button>
```

**说明**: 直接跳转到独立的设备详情页面

---

### 5. 移除全屏 Dialog

**修改前**:
```tsx
{/* 设备详情全屏弹窗 */}
{selectedDeviceId && (
  <Dialog open={!!selectedDeviceId} onOpenChange={(open) => !open && setSelectedDeviceId(null)}>
    <DialogContent className="max-w-full w-screen h-screen p-0 gap-0 bg-background">
      <DialogHeader className="sr-only">
        <DialogTitle>设备维修详情</DialogTitle>
      </DialogHeader>
      <div className="h-full overflow-y-auto">
        <RepairDetail 
          taskId={selectedDeviceId} 
          onBack={() => setSelectedDeviceId(null)}
          inBatchMode={true}
        />
      </div>
    </DialogContent>
  </Dialog>
)}
```

**修改后**:
```tsx
// 完全移除
```

---

## ✅ 重构效果

### 用户体验对比

| 特性 | 重构前（Dialog） | 重构后（Page） |
|------|------------------|----------------|
| **URL 地址** | 停留在 `/batch/[id]` | ✅ 跳转到 `/repairs/detail/[deviceId]` |
| **浏览器前进/后退** | ❌ 无法使用 | ✅ 完全支持 |
| **刷新页面** | ❌ 返回批次详情 | ✅ 停留在设备详情 |
| **分享链接** | ❌ 无法分享设备详情 | ✅ 可以直接分享 |
| **浏览器书签** | ❌ 只能收藏批次详情 | ✅ 可以收藏设备详情 |
| **页面布局** | 全屏 Dialog | ✅ **完整的独立页面布局**（带进度条、工单基础信息等） |

---

## 🔍 用户路径示例

### 重构后的完整流程

1. 用户访问 **批次工单详情页面**：
   ```
   /report/batch/WO2602263315
   或
   /batch/WO2602263315
   ```

2. 看到批次工单的基础信息和设备列表：
   - 工单号：WO2602263315
   - 项目名称：矿视
   - 项目位置：深圳机场
   - 设备数量：3 台
   - 设备列表（表格形式）

3. 点击某个设备的 **"查看详情"** 按钮

4. **跳转到独立的设备详情页面**：
   ```
   /repairs/detail/N76J2501
   ```

5. 看到完整的设备详情页面：
   - ✅ 顶部返回按钮
   - ✅ 工单进度条（工单创建 → 仓库确认 → 待维修检查 → ... → 已完成）
   - ✅ 工单基础信息卡片
   - ✅ 维修工作台（三列布局）
   - ✅ 商务/管理员工作台
   - ✅ 物流发货工作台
   - ✅ 照片凭证
   - ✅ 处理记录

6. 点击返回按钮，返回到批次工单详情页面

---

## 📐 页面布局对比

### 重构前（Dialog 模式）
```
/batch/WO2602263315
└─ [全屏 Dialog]
   └─ RepairDetail 组件
      ├─ 顶部返回按钮（关闭 Dialog）
      ├─ 维修工单详情标题
      ├─ 工作流操作栏
      └─ 维修工作台（但宽度受限）
```

### 重构后（Page 模式）
```
/batch/WO2602263315
└─ 批次工单详情页面
   ├─ 工单进度条
   ├─ 工单基础信息
   └─ 设备列表
      └─ [点击"查看详情"]
         └─ [路由跳转]
            
/repairs/detail/N76J2501
└─ 设备详情页面（完整的独立页面）
   ├─ 顶部返回按钮（router.back()）
   ├─ 工单详情标题 + 工单号
   ├─ 工单进度条（带步骤说明）
   ├─ 工单基础信息卡片
   │  ├─ 工单号
   │  ├─ 项目名称
   │  ├─ 项目位置
   │  ├─ 联系信息
   │  └─ 设备数量
   ├─ 维修工作台（三列响应式布局）
   ├─ 商务/管理员工作台
   ├─ 物流发货工作台
   └─ 照片凭证 + 处理记录
```

---

## 🧪 测试清单

### 功能测试
- [x] 点击"查看详情"能正确跳转到设备详情页
- [x] URL 地址正确显示设备 ID
- [x] 点击返回按钮能返回到批次详情页
- [x] 浏览器前进/后退按钮正常工作
- [x] 刷新页面后仍停留在设备详情页
- [x] 设备详情页显示完整的页面布局（带进度条）

### 边界测试
- [x] 从批次详情进入设备详情，点击返回能正确返回
- [x] 直接访问 `/repairs/detail/[deviceId]` 能正确显示设备详情
- [x] 设备详情页的所有功能正常（编辑、保存、状态流转等）

---

## 📊 代码变化统计

### 修改文件
- ✅ `components/batch-work-order-detail.tsx`
  - 移除 1 个 import (`RepairDetail`)
  - 移除 1 个 state 变量 (`selectedDeviceId`)
  - 修改 1 处点击处理逻辑（`onClick={() => router.push(...)}）
  - 移除 TableRow 整行点击
  - 移除 1 个全屏 Dialog (约 17 行)
  - **净减少**: ~15 行代码

---

## 🎯 技术细节

### 路由复用
现在批次工单中的设备详情和单个工单详情都使用同一个路由：
```
/repairs/detail/[id]
```

这确保了：
- ✅ **UI 一致性**: 无论从哪里进入，设备详情页面的布局完全一致
- ✅ **代码复用**: 只需要维护一个设备详情页面组件
- ✅ **用户体验一致**: 所有设备详情都有完整的页面布局（进度条、工单信息等）

### 返回逻辑
设备详情页面使用 `router.back()`：
```tsx
const handleBack = () => {
  router.back();
};
```

这意味着：
- 从批次详情进入 → 返回批次详情
- 从工单列表进入 → 返回工单列表
- 从搜索结果进入 → 返回搜索结果
- ✅ **智能返回**，支持多种入口

---

## 📝 总结

### 重构成果
- ✅ 移除批次工单中设备详情的全屏 Dialog
- ✅ 改为直接跳转到独立的设备详情页面
- ✅ 提升用户体验（URL、浏览器导航、分享等）
- ✅ 简化代码逻辑，减少状态管理
- ✅ 保持完整的页面布局（进度条、工单信息等）

### 用户价值
- 📊 **完整的页面布局**: 和单个工单详情一样，有进度条、工单基础信息等
- 🔗 **可分享**: 可以直接分享设备详情链接
- 🔄 **可导航**: 浏览器前进/后退按钮正常工作
- 📌 **可收藏**: 可以将设备详情添加到浏览器书签
- 🚀 **更流畅**: 标准页面路由，性能更好

### 一致性
现在系统中的所有工单详情（无论是单个工单还是批次工单中的设备）都使用**统一的独立页面路由**，确保了：
- ✅ UI/UX 完全一致
- ✅ 用户体验统一
- ✅ 代码维护更简单

---

**文档版本**: v1.0  
**最后更新**: 2026-02-26  
**维护者**: AI Assistant
