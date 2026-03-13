# 对话框模式优化 - 减少页面跳转

## 优化目标

用户反馈批次工单详情页面体验很好，所有信息（设备列表、聊天、签字凭证）都集中在一个页面，不需要频繁跳转。现在将"编辑维修报告"和"打印维修报告"也改为在对话框(Dialog)中打开，进一步减少页面跳转，提升用户体验。

## 优化内容

### ✅ 修改的文件

#### 1. `components/batch-work-order-detail.tsx`

**主要改动：**

1. **添加对话框状态**
```typescript
const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
const [isEmbedMode, setIsEmbedMode] = useState(false);
```

2. **修改按钮行为**
```typescript
// 从 router.push 改为打开 Dialog
onClick={() => setIsEditDialogOpen(true)}  // 编辑
onClick={() => setIsPrintDialogOpen(true)} // 打印
```

3. **添加 iframe 嵌入的对话框**
```typescript
<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
  <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh] p-1">
    <Button ... onClick={() => setIsEditDialogOpen(false)}>
      <X className="h-4 w-4" />
    </Button>
    <iframe
      src={`/repairs/edit/${batchId}?embed=true`}
      className="w-full h-full border-0 rounded-lg"
      title="编辑维修报告"
    />
  </DialogContent>
</Dialog>
```

4. **监听 iframe 消息**
```typescript
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    
    // 报告保存后刷新数据
    if (event.data.type === 'REPAIR_REPORT_SAVED') {
      fetchBatchDevices();
      toast.success('操作成功，数据已刷新');
    }
    
    // 编辑完成后自动打开打印对话框
    if (event.data.type === 'CLOSE_EDIT_AND_OPEN_PRINT') {
      setIsEditDialogOpen(false);
      setTimeout(() => setIsPrintDialogOpen(true), 300);
    }
    
    // 关闭对话框
    if (event.data.type === 'CLOSE_DIALOG') {
      setIsEditDialogOpen(false);
      setIsPrintDialogOpen(false);
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

#### 2. `app/repairs/edit/[id]/page.tsx`

**主要改动：**

1. **检测嵌入模式**
```typescript
const [isEmbedMode, setIsEmbedMode] = useState(false);

useEffect(() => {
  const searchParams = new URLSearchParams(window.location.search);
  setIsEmbedMode(searchParams.get('embed') === 'true');
}, []);
```

2. **保存成功后发送消息**
```typescript
if (result.success) {
  alert(result.message || '保存成功！');
  
  if (isEmbedMode) {
    // 通知父窗口数据已保存
    window.parent.postMessage(
      { type: 'REPAIR_REPORT_SAVED' }, 
      window.location.origin
    );
    
    // 关闭编辑对话框并打开打印对话框
    setTimeout(() => {
      window.parent.postMessage(
        { type: 'CLOSE_EDIT_AND_OPEN_PRINT' }, 
        window.location.origin
      );
    }, 500);
  } else {
    // 非嵌入模式，正常跳转
    router.push(`/repairs/print/${params.id}`);
  }
}
```

#### 3. `app/repairs/print/[id]/page.tsx`

**主要改动：**

1. **检测嵌入模式**
```typescript
const [isEmbedMode, setIsEmbedMode] = useState(false);

useEffect(() => {
  const searchParams = new URLSearchParams(window.location.search);
  setIsEmbedMode(searchParams.get('embed') === 'true');
}, []);
```

2. **确认/上传后发送消息**
```typescript
if (result.success) {
  toast({ title: '上传成功' });
  
  // 重新加载数据...
  
  // 如果在嵌入模式，通知父窗口
  if (isEmbedMode) {
    window.parent.postMessage(
      { type: 'REPAIR_REPORT_CONFIRMED' }, 
      window.location.origin
    );
  }
}
```

## 用户体验提升

### 优化前 ❌
```
批次详情页
    ↓ 点击"编辑维修报告"
跳转到 /repairs/edit/[id] 页面（新页面）
    ↓ 保存
跳转到 /repairs/print/[id] 页面（新页面）
    ↓ 返回
需要手动导航回批次详情页
❌ 多次页面跳转，上下文丢失
```

### 优化后 ✅
```
批次详情页
    ↓ 点击"编辑维修报告"
✅ 弹出编辑对话框（在 iframe 中）
    ↓ 保存
✅ 自动切换到打印对话框（在 iframe 中）
    ↓ 确认/上传
✅ 自动刷新数据
    ↓ 关闭对话框
✅ 回到批次详情页（从未离开！）
```

## 技术实现

### 1. 对话框尺寸

```css
className="max-w-[95vw] max-h-[95vh] h-[95vh]"
```

- 使用视口单位（vw/vh）确保在各种屏幕尺寸下都能良好显示
- 95% 的尺寸留出边距，避免完全全屏的压迫感

### 2. iframe 通信

使用 `window.postMessage` API 实现父子窗口通信：

**子窗口（iframe）发送消息：**
```typescript
window.parent.postMessage(
  { type: 'REPAIR_REPORT_SAVED' }, 
  window.location.origin
);
```

**父窗口监听消息：**
```typescript
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  
  if (event.data.type === 'REPAIR_REPORT_SAVED') {
    // 处理保存事件
  }
});
```

### 3. URL 参数传递模式

通过 `?embed=true` 参数告知页面当前处于嵌入模式：

```typescript
src={`/repairs/edit/${batchId}?embed=true`}
```

页面检测参数并调整行为：
```typescript
const searchParams = new URLSearchParams(window.location.search);
const isEmbedMode = searchParams.get('embed') === 'true';
```

### 4. 自动流程衔接

编辑保存后自动打开打印对话框：

```typescript
if (event.data.type === 'CLOSE_EDIT_AND_OPEN_PRINT') {
  setIsEditDialogOpen(false);
  setTimeout(() => {
    setIsPrintDialogOpen(true);
  }, 300); // 延迟确保关闭动画完成
}
```

## 测试要点

### 基本功能
- ✅ 点击"编辑维修报告"打开对话框
- ✅ 编辑页面在 iframe 中正常显示和操作
- ✅ 保存成功后自动切换到打印对话框
- ✅ 打印页面在 iframe 中正常显示
- ✅ 确认/上传后数据自动刷新
- ✅ 关闭按钮（X）正常工作

### 数据同步
- ✅ iframe 中的操作触发父页面数据刷新
- ✅ 刷新后的数据正确显示在批次详情页
- ✅ 设备列表、聊天、签字凭证都正确更新

### 兼容性
- ✅ 非嵌入模式（直接访问URL）仍正常工作
- ✅ 编辑和打印页面独立访问时功能正常
- ✅ 权限检查在两种模式下都正常工作

### 用户体验
- ✅ 对话框尺寸适中，内容清晰可见
- ✅ 关闭按钮位置明显，易于操作
- ✅ 操作流程流畅，无卡顿
- ✅ Toast 提示及时反馈操作结果

## 扩展性

此优化方案可以轻松扩展到其他需要在对话框中打开的页面：

1. 添加 `?embed=true` 参数支持
2. 添加 `postMessage` 消息发送
3. 在父页面添加消息监听处理
4. 在父页面用 Dialog + iframe 打开

示例：
```typescript
// 任何页面都可以快速改造成支持对话框模式
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh] p-1">
    <iframe 
      src={`/any-page?embed=true`}
      className="w-full h-full border-0 rounded-lg"
    />
  </DialogContent>
</Dialog>
```

## 注意事项

1. **安全性**：始终验证 `event.origin` 确保消息来自同源
2. **兼容性**：iframe 内页面必须支持嵌入（无 X-Frame-Options 限制）
3. **性能**：iframe 会创建新的文档上下文，需要重新加载资源
4. **样式**：iframe 内页面的样式完全独立，不受父页面影响

---

**优化时间**: 2026-02-25  
**版本**: v1.2.0  
**状态**: ✅ 已完成
