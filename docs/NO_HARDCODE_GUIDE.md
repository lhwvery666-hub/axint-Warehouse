# 商用软件去硬编码指南

## ⚠️ 为什么不能硬编码？

作为商用软件，硬编码会导致：
1. **无法灵活配置** - 每次修改业务规则都要改代码、重新部署
2. **维护成本高** - 不同客户需求不同，硬编码无法适应
3. **不专业** - 商用软件应该提供配置界面，而非修改代码
4. **安全风险** - 敏感信息暴露在前端代码中

## ✅ 已完成的去硬编码改造

### 1. 创建系统配置表
**文件**: `scripts/create-system-config-table.ts`

**配置表结构**:
```sql
CREATE TABLE System_Config (
  ConfigKey NVARCHAR(100) PRIMARY KEY,
  ConfigValue NVARCHAR(MAX) NOT NULL,
  ConfigType NVARCHAR(50) NOT NULL,  -- String/Number/Boolean/JSON
  Category NVARCHAR(50) NOT NULL,     -- Warranty/Report/Workflow/General
  Description NVARCHAR(500),
  IsEditable BIT DEFAULT 1,
  CreatedAt DATETIME DEFAULT GETDATE(),
  UpdatedAt DATETIME DEFAULT GETDATE()
)
```

**运行脚本**:
```bash
npm run create-config-table
```

### 2. 配置管理工具
**文件**: `lib/config.ts`

**主要功能**:
- `getConfig(key, defaultValue)` - 获取单个配置
- `getConfigs(keys)` - 批量获取配置
- `setConfig(key, value)` - 更新配置
- `getConfigsByCategory(category)` - 按分类获取配置
- 自动缓存（5分钟）

**使用示例**:
```typescript
import { getConfig, ConfigKeys } from '@/lib/config';

// 获取保修期配置
const warrantyPeriod = await getConfig<number>(
  ConfigKeys.WARRANTY_DEFAULT_PERIOD, 
  12  // 默认值
);

// 获取公司名称
const companyName = await getConfig<string>(
  ConfigKeys.SYSTEM_COMPANY_NAME, 
  '公司名称'
);
```

### 3. 配置管理API
**文件**: `app/api/config/route.ts`

**API端点**:
```bash
# 获取单个配置
GET /api/config?key=warranty.default_period_months

# 获取多个配置
GET /api/config?keys=warranty.default_period_months,system.company_name

# 按分类获取
GET /api/config?category=Warranty

# 更新配置（需要管理员权限）
PUT /api/config
{
  "key": "warranty.default_period_months",
  "value": 24
}
```

## 📋 可配置项清单

### 保修相关
| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `warranty.default_period_months` | Number | 12 | 默认保修期（月） |
| `warranty.auto_check_enabled` | Boolean | true | 是否自动检查保修状态 |

### 维修报告
| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `report.template` | JSON | {...} | 维修报告模板 |
| `report.require_signature` | Boolean | true | 是否要求客户签字 |

### 工作流
| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `workflow.in_warranty_auto_approve` | Boolean | false | 保内维修是否自动批准 |
| `workflow.out_warranty_require_confirm` | Boolean | true | 过保维修是否需要客户确认 |
| `workflow.payment_required_for_out_warranty` | Boolean | true | 过保维修是否需要收款 |

### Excel导出
| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `export.split_by_serial_number` | Boolean | true | 导出时是否按序列号分行 |
| `export.include_deleted` | Boolean | false | 导出时是否包含已删除工单 |

### 系统设置
| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `system.company_name` | String | 公司名称 | 公司名称 |
| `system.support_phone` | String | (空) | 技术支持电话 |
| `system.support_email` | String | (空) | 技术支持邮箱 |

## 🔧 已重构的API

### 1. 设置出厂日期API
**文件**: `app/api/tickets/[id]/set-manufacture-date/route.ts`

**改造前**:
```typescript
// ❌ 硬编码保修期
const { warrantyPeriodMonths = 12 } = body;
```

**改造后**:
```typescript
// ✅ 从配置读取
const defaultWarrantyPeriod = await getConfig<number>(
  ConfigKeys.WARRANTY_DEFAULT_PERIOD, 
  12
);
const { warrantyPeriodMonths = defaultWarrantyPeriod } = body;
```

### 2. 生成维修报告API
**文件**: `app/api/tickets/[id]/generate-repair-report/route.ts`

**改造前**:
```typescript
// ❌ 硬编码报告模板和公司信息
const reportContent = `维修报告\n公司名称...`;
```

**改造后**:
```typescript
// ✅ 从配置读取公司信息
const companyName = await getConfig<string>(ConfigKeys.SYSTEM_COMPANY_NAME, '公司名称');
const supportPhone = await getConfig<string>(ConfigKeys.SYSTEM_SUPPORT_PHONE, '');
const supportEmail = await getConfig<string>(ConfigKeys.SYSTEM_SUPPORT_EMAIL, '');

// 使用可配置的模板函数
const reportContent = generateReportContent({
  companyName,
  supportPhone,
  supportEmail,
  // ...其他参数
});
```

## 🎯 最佳实践

### ✅ 正确做法
```typescript
// 1. 从配置读取
const maxFileSize = await getConfig<number>('upload.max_file_size_mb', 10);

// 2. 使用枚举常量
import { ConfigKeys } from '@/lib/config';
const warrantyPeriod = await getConfig<number>(ConfigKeys.WARRANTY_DEFAULT_PERIOD, 12);

// 3. 提供合理的默认值
const companyName = await getConfig<string>('system.company_name', '公司名称');
```

### ❌ 错误做法
```typescript
// 1. 硬编码数字
const warrantyPeriod = 12;  // ❌

// 2. 硬编码字符串
const companyName = "XX公司";  // ❌

// 3. 硬编码业务规则
if (price > 1000) {  // ❌ 1000应该从配置读取
  requireApproval = true;
}

// 4. 硬编码模板
const template = `固定的模板内容...`;  // ❌
```

## 🚀 使用步骤

### 第一步：创建配置表
```bash
npm run create-config-table
```

### 第二步：在代码中使用配置
```typescript
import { getConfig, ConfigKeys } from '@/lib/config';

// 在API中使用
export async function POST(request: Request) {
  const warrantyPeriod = await getConfig<number>(
    ConfigKeys.WARRANTY_DEFAULT_PERIOD, 
    12
  );
  
  // 使用配置值
  // ...
}
```

### 第三步：通过API管理配置
```bash
# 更新保修期为24个月
curl -X PUT http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "key": "warranty.default_period_months",
    "value": 24
  }'
```

## 📱 前端配置管理界面（建议开发）

### 推荐功能
1. **配置列表页面** - 显示所有可配置项
2. **分类筛选** - 按Warranty、Report、Workflow等分类
3. **在线编辑** - 直接修改配置值
4. **权限控制** - 只有管理员可以修改
5. **配置历史** - 记录配置变更历史
6. **配置导入导出** - 便于备份和迁移

### 示例界面结构
```
配置管理
├── 保修设置
│   ├── 默认保修期: [12] 月
│   └── 自动检查保修: [✓] 启用
├── 维修报告
│   ├── 要求客户签字: [✓] 启用
│   └── 报告模板: [编辑]
├── 工作流设置
│   ├── 保内自动批准: [ ] 禁用
│   └── 过保需要确认: [✓] 启用
└── 系统设置
    ├── 公司名称: [XX公司]
    ├── 支持电话: [400-xxx-xxxx]
    └── 支持邮箱: [support@xxx.com]
```

## 🔒 安全注意事项

1. **配置API需要权限控制** - 只有管理员可以修改
2. **敏感配置加密存储** - 如API密钥、数据库密码等
3. **配置变更日志** - 记录谁在什么时候修改了什么
4. **配置验证** - 修改前验证值的合法性
5. **配置备份** - 定期备份配置数据

## 📊 配置vs硬编码对比

| 项目 | 硬编码 | 配置化 |
|------|--------|--------|
| 修改方式 | 改代码、重新部署 | 在线修改、立即生效 |
| 适应性 | 差，每个客户都要改代码 | 好，不同客户不同配置 |
| 维护成本 | 高 | 低 |
| 专业性 | 不专业 | 专业 |
| 安全性 | 低（代码暴露） | 高（数据库存储） |

## ✅ 检查清单

在发布商用软件前，检查以下项目：

- [ ] 所有业务规则从配置读取
- [ ] 没有硬编码的数字（魔法数字）
- [ ] 没有硬编码的字符串（公司名称、联系方式等）
- [ ] 没有硬编码的模板
- [ ] 配置API有权限控制
- [ ] 提供配置管理界面
- [ ] 配置有合理的默认值
- [ ] 配置有详细的说明文档

## 🎓 总结

**核心原则**：
1. **一切可变的都应该可配置**
2. **配置存储在数据库，不在代码中**
3. **提供友好的配置管理界面**
4. **保持代码的灵活性和可维护性**

**记住**：商用软件 = 可配置 + 可扩展 + 可维护
