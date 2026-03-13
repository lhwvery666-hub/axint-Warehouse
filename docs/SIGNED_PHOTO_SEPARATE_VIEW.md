# 签字照片独立查看功能

## 📋 用户反馈

> "维修人员那边好像看不到这个图片还有这个图片单独存放不要和这个报告放在里面因为这个签字的内容就是我们的那个维修报告"

## 🧐 问题分析

### 原有设计的问题
1. ❌ 签字照片嵌入在打印报告中，导致"报告里又有一张报告的照片"
2. ❌ 逻辑上不合理：签字照片是客户在打印出来的报告上签字的，不应该出现在报告本身中
3. ❌ 维修人员可能看不到签字照片

### 正确的设计思路
✅ 签字照片应该作为**独立的凭证**查看，而不是报告的一部分
✅ 签字照片应该在工单详情页有单独的区域展示
✅ 所有相关人员（维修人员、管理员、商务等）都可以在工单详情查看

---

## ✅ 解决方案

### 核心改动
1. **从打印报告中移除照片显示** - 打印报告保持纯净，只显示维修内容
2. **在工单详情页添加独立的"签字凭证"板块** - 单独展示签字照片
3. **完善API数据查询** - 确保签字照片数据正确传递

---

## 🔧 具体实施

### 1. 从打印报告页面移除照片显示

**文件**: `app/repairs/print/[id]/page.tsx`

**修改**: 移除了签字照片显示组件

**修改前**:
```tsx
{/* 备注区域 */}
<div className="remarks-section">...</div>

{/* 签字报告照片显示 */}
{batchInfo.signedReportPhoto && (
  <div className="signed-photo-section">
    <img src={...} />
  </div>
)}

{/* 签字区域 */}
<div className="signature-section">...</div>
```

**修改后**:
```tsx
{/* 备注区域 */}
<div className="remarks-section">...</div>

{/* 签字区域 */}
<div className="signature-section">...</div>
```

**✅ 结果**: 打印报告更简洁，不会出现"报告里有报告"的尴尬情况

---

### 2. 在工单详情页添加"签字凭证"板块

**文件**: `components/repair-detail.tsx`

#### 2.1 添加图标导入

```typescript
import { 
  // ... 其他图标
  FileCheck,  // ✅ 新增
  CheckCircle,  // ✅ 新增
  ZoomIn,  // ✅ 新增
  Download,  // ✅ 新增
  Copy  // ✅ 新增
} from "lucide-react"
```

#### 2.2 添加 signedReportPhoto 字段到状态

```typescript
const [repairData, setRepairData] = useState({
  // ... 其他字段
  // 签字报告照片
  signedReportPhoto: null as string | null  // ✅ 新增
});
```

#### 2.3 添加新的 AccordionItem（板块6：签字凭证）

```tsx
{/* 板块6：签字凭证（所有角色可见） */}
<AccordionItem value="panel6">
  <AccordionTrigger className="text-base font-semibold">
    <div className="flex items-center gap-2">
      <FileCheck className="h-5 w-5" />
      <span>签字凭证</span>
      {repairData.signedReportPhoto && (
        <Badge variant="default" className="ml-2 bg-green-600">已上传</Badge>
      )}
    </div>
  </AccordionTrigger>
  <AccordionContent>
    <Card>
      <CardContent className="pt-6">
        {repairData.signedReportPhoto ? (
          <div className="space-y-4">
            {/* 状态提示 */}
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-900">现场人员已上传签字凭证</p>
                <p className="text-sm text-green-700">客户已在打印的维修报告上签字确认</p>
              </div>
            </div>
            
            {/* 照片显示 */}
            <div className="border rounded-lg p-4 bg-white">
              <h4 className="font-medium mb-3 text-sm text-gray-700">签字报告照片</h4>
              <div className="relative group">
                <img 
                  src={`/${repairData.signedReportPhoto}`}
                  alt="客户签字报告"
                  className="w-full rounded-md border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => window.open(`/${repairData.signedReportPhoto}`, '_blank')}
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-md flex items-center justify-center">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => window.open(`/${repairData.signedReportPhoto}`, '_blank')}
                  >
                    <ZoomIn className="h-4 w-4 mr-2" />
                    点击查看大图
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                💡 点击图片可查看大图 | 此照片可作为客户确认的凭证
              </p>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(`/${repairData.signedReportPhoto}`, '_blank')}
              >
                <Download className="h-4 w-4 mr-2" />
                下载照片
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + '/' + repairData.signedReportPhoto);
                  alert('照片链接已复制到剪贴板');
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                复制链接
              </Button>
            </div>
          </div>
        ) : (
          {/* 未上传状态 */}
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-3">
              <Camera className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium mb-1">暂无签字凭证</p>
            <p className="text-sm text-gray-500">现场人员确认后会上传客户签字的报告照片</p>
          </div>
        )}
      </CardContent>
    </Card>
  </AccordionContent>
</AccordionItem>
```

**✅ 功能特点**:
- 独立的折叠面板，不干扰其他内容
- 有照片时显示"已上传"徽章
- 照片支持点击放大、下载、复制链接
- 鼠标悬停时显示"查看大图"按钮
- 未上传时显示友好的提示信息

---

### 3. 完善API数据查询

#### 3.1 修改工单详情API

**文件**: `app/api/tickets/[id]/route.ts`

**添加字段映射**:
```typescript
// 签字报告照片
const signedReportPhotoColumn = mapColumn("SignedReportPhoto", "SignedReportPhoto")
```

**添加到SELECT查询**:
```typescript
const selectColumns = [
  // ... 其他字段
  // 签字报告照片
  ...(columnNames.includes(signedReportPhotoColumn) ? [signedReportPhotoColumn] : []),
]
```

**添加到返回数据**:
```typescript
const responseData = {
  // ... 其他字段
  // 签字报告照片
  signedReportPhoto: ticket[signedReportPhotoColumn] || null,
};
```

#### 3.2 修改批次维修报告API

**文件**: `app/api/tickets/batch-repair-report/[batchId]/route.ts`

**已在之前的修改中完成**，确保返回数据包含 `signedReportPhoto`

---

## 🎨 视觉效果

### 工单详情页布局

```
┌─────────────────────────────────────────┐
│ 板块1：现场报告（基础信息）              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 板块2：维修工作台                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 板块3：商务/管理员工作台                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 板块4：物流发货工作台                    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 板块5：工单沟通记录                      │
└─────────────────────────────────────────┘

╔═════════════════════════════════════════╗
║ 板块6：签字凭证 [已上传]                ║ ← 新增
╠═════════════════════════════════════════╣
║ ┌─────────────────────────────────────┐ ║
║ │ ✅ 现场人员已上传签字凭证            │ ║
║ │ 客户已在打印的维修报告上签字确认     │ ║
║ └─────────────────────────────────────┘ ║
║                                         ║
║ ┌─────────────────────────────────────┐ ║
║ │   [客户签字报告照片]                 │ ║
║ │   点击可查看大图                     │ ║
║ └─────────────────────────────────────┘ ║
║                                         ║
║ [下载照片] [复制链接]                   ║
╚═════════════════════════════════════════╝
```

### 打印报告布局（简洁版）

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃    深圳市爱克信智能股份有限公司   ┃
┃         产品维修单            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌───────────────────────────────┐
│ 基本信息表格                   │
└───────────────────────────────┘

┌───────────────────────────────┐
│ 维修明细表格                   │
└───────────────────────────────┘

┌───────────────────────────────┐
│ 备注                           │
└───────────────────────────────┘

┌──────────────┬────────────────┐
│维修负责人：XXX│日期：2026-02-24│
└──────────────┴────────────────┘

┌───────────────────────────────┐
│ 联系人：黄工                   │
│ 电话：13530978726             │
│ 地址：深圳市宝安区...          │
└───────────────────────────────┘

✅ 不再显示签字照片（更符合逻辑）
```

---

## 🔄 完整工作流程

### 现场人员上传照片

```
1. 现场人员登录系统
   ↓
2. 进入工单打印/确认页面
   ↓
3. 打印维修报告并让客户签字
   ↓
4. 拍照或扫描签字后的报告
   ↓
5. 在页面上传照片
   ↓
6. 点击"确认提交"
   ↓
7. ✅ 照片保存到服务器和数据库
   → 服务器路径：public/uploads/signed-reports/
   → 数据库字段：SignedReportPhoto
```

---

### 维修人员查看照片

```
1. 维修人员登录系统
   ↓
2. 进入工单详情页
   ↓
3. 滚动到底部，展开"签字凭证"板块
   ↓
4. 📸 如果现场人员已上传照片：
   → 看到"已上传"绿色徽章
   → 看到签字报告照片
   → 可以点击放大、下载、复制链接
   ↓
5. ❌ 如果现场人员还没上传照片：
   → 看到"暂无签字凭证"提示
   → 说明现场人员还没确认
```

---

### 其他角色查看照片

所有角色（管理员、商务、仓库等）都可以通过同样的方式在工单详情页查看签字凭证。

---

## 🎯 权限控制

| 角色 | 上传照片 | 查看照片 | 下载照片 | 说明 |
|-----|---------|---------|---------|------|
| 现场人员 | ✅ 可以 | ✅ 可以 | ✅ 可以 | 上传者 |
| 维修人员 | ❌ 不可以 | ✅ 可以 | ✅ 可以 | 需要查看确认 |
| 管理员 | ❌ 不可以 | ✅ 可以 | ✅ 可以 | 监督审核 |
| 商务人员 | ❌ 不可以 | ✅ 可以 | ✅ 可以 | 客户服务 |
| 仓库人员 | ❌ 不可以 | ✅ 可以 | ✅ 可以 | 物流管理 |

---

## ✅ 功能特点

### 1. 逻辑清晰
- ✅ 签字照片不再出现在打印报告中，避免"报告里有报告"
- ✅ 签字照片作为独立凭证，单独查看和管理

### 2. 位置合理
- ✅ 在工单详情页有专门的"签字凭证"板块
- ✅ 所有相关人员都能方便查看

### 3. 交互友好
- ✅ 点击图片可放大查看
- ✅ 支持下载照片
- ✅ 支持复制链接分享
- ✅ 鼠标悬停显示操作提示

### 4. 状态明确
- ✅ 有照片时显示"已上传"徽章
- ✅ 无照片时显示友好提示
- ✅ 一目了然的状态展示

---

## 🧪 测试步骤

### 测试1：现场人员上传照片

1. [ ] 登录为现场人员
2. [ ] 进入工单打印/确认页面
3. [ ] 上传签字照片
4. [ ] 点击"确认提交"
5. [ ] **验证**：提示上传成功

---

### 测试2：维修人员查看照片（工单详情页）

1. [ ] 登录为维修人员
2. [ ] 进入有签字照片的工单详情页
3. [ ] 滚动到底部，找到"签字凭证"板块
4. [ ] **验证**：标题旁显示"已上传"绿色徽章
5. [ ] 展开"签字凭证"板块
6. [ ] **验证**：看到签字报告照片
7. [ ] **验证**：照片清晰，不变形
8. [ ] 点击照片
9. [ ] **验证**：在新标签页打开大图
10. [ ] 点击"下载照片"
11. [ ] **验证**：照片下载成功
12. [ ] 点击"复制链接"
13. [ ] **验证**：提示"照片链接已复制到剪贴板"

---

### 测试3：打印报告不显示照片

1. [ ] 进入有签字照片的工单
2. [ ] 点击"查看维修报告"或"打印报告"
3. [ ] **验证**：报告中不显示签字照片
4. [ ] **验证**：报告布局简洁，只有维修内容
5. [ ] 按 `Ctrl+P` 查看打印预览
6. [ ] **验证**：打印预览中也没有签字照片

---

### 测试4：未上传照片的状态

1. [ ] 进入没有签字照片的工单详情页
2. [ ] 滚动到底部，找到"签字凭证"板块
3. [ ] **验证**：标题旁没有"已上传"徽章
4. [ ] 展开"签字凭证"板块
5. [ ] **验证**：显示"暂无签字凭证"
6. [ ] **验证**：显示提示文字："现场人员确认后会上传客户签字的报告照片"

---

### 测试5：不同角色查看

1. [ ] 管理员登录 → 查看工单详情 → **验证**：能看到签字凭证
2. [ ] 商务人员登录 → 查看工单详情 → **验证**：能看到签字凭证
3. [ ] 仓库人员登录 → 查看工单详情 → **验证**：能看到签字凭证

---

## 📝 修改文件清单

1. ✅ `components/repair-detail.tsx`
   - 添加图标导入（FileCheck, CheckCircle, ZoomIn, Download, Copy）
   - 添加 `signedReportPhoto` 字段到状态
   - 添加 `signedReportPhoto` 到类型定义
   - 添加 `signedReportPhoto` 到数据加载逻辑
   - 新增板块6：签字凭证

2. ✅ `app/api/tickets/[id]/route.ts`
   - 添加 `signedReportPhotoColumn` 字段映射
   - 添加到 SELECT 查询列表
   - 添加到返回数据对象

3. ✅ `app/repairs/print/[id]/page.tsx`
   - 移除签字照片显示组件

4. ✅ `styles/print.css`
   - （不需要修改，因为已经移除了签字照片显示）

---

## 📊 改进对比

| 项目 | 优化前 | 优化后 |
|-----|--------|--------|
| 照片位置 | ❌ 嵌入打印报告 | ✅ 独立在工单详情页 |
| 逻辑合理性 | ❌ 报告里有报告照片 | ✅ 作为独立凭证查看 |
| 维修人员查看 | ❌ 可能看不到 | ✅ 清晰可见 |
| 打印报告 | ❌ 包含照片 | ✅ 简洁纯净 |
| 操作便捷性 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 功能完整度 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 💡 设计思路总结

### 为什么签字照片不应该在打印报告中？

签字照片是**客户在打印出来的维修报告上签字**的照片，如果把这个照片再嵌入到报告里，就会产生逻辑悖论：

```
打印报告 → 客户签字 → 拍照上传 → 再放进报告里？❌

正确流程应该是：
打印报告 → 客户签字 → 拍照上传 → 作为独立凭证存档 ✅
```

### 为什么要单独设立"签字凭证"板块？

1. **逻辑清晰**：签字照片是确认凭证，不是报告内容
2. **权限分离**：所有人都可以查看凭证，但只有现场人员可以上传
3. **操作方便**：独立板块，支持放大、下载、分享
4. **状态明确**："已上传"徽章一目了然

---

**功能完成日期**：2026-02-24  
**开发者**：AI Assistant  
**状态**：✅ 已完成，待测试
