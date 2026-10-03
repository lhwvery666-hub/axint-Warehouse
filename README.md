# 爱克信维修管理系统 · 1.0

| 版本 | GitHub 分支 | 用途 |
| --- | --- | --- |
| **1.0试用** | [`codex/1.0-trial`](https://github.com/lhwvery666-hub/axint-Warehouse/tree/codex/1.0-trial) | 保留公司已使用约一个月的原始代码，提交 `5d70cc0c82e821fd04e967e5764e4b2752f17525` |
| **1.0** | [`codex/1.0`](https://github.com/lhwvery666-hub/axint-Warehouse/tree/codex/1.0) | 按确认的业务规则修复后的新版本，待公司数据库联调验收 |

`master` 暂时保留原版本。GitHub 备份保存的是源码；实际业务数据库、上传的照片、签字件和运行配置需要单独备份。

## 已确认的业务规则

- 每台设备单独收费，批次费用只求和；收款和开票状态不覆盖设备费用。
- 发回客户不能分批。返厂维修可以按厂家分别寄出。
- 所有设备都有最终处理结果后才能统一发回；允许部分入库、其余发回。例如 10 台中 3 台入库、7 台返回，全部 10 台处理完后统一返回这 7 台。
- 维修报告签字前允许修改并覆盖内容，签字后锁定。不得通过撤回签字或更正流程绕过锁定。
- 保留公司允许的跨岗位商务、开票和物流编辑；现场只查询本人创建的工单，维修、仓库、商务和管理员可查询全部。
- 现场不能读取供应商、返厂物流及内部产品资料；报修所需 SN、型号、数量和面向客户的维修报告保留。
- 附件允许通过具体链接免登录查看，附件清单仍按工单归属控制。客户可见报告内容由填写人按公司规定填写，不应填写内部厂商资料。

## 开发与验证

使用 Node.js 24，安装后生成 Prisma 客户端：

```sh
npm ci --ignore-scripts
npm run prisma:generate
npm test
npm run typecheck
npm run lint
npm run audit:api-auth
npm run prisma:validate
npm run build
```

`npm test` 自动发现全部 `lib/__tests__/*.test.ts`，使用隔离身份和数据库桩；测试进程显式覆盖数据库地址，避免误连接公司的数据库。这些测试不代替 SQL Server 集成验收。

开发和正式运行需要配置 SQL Server 的 `DATABASE_URL`、相应 `DB_*` 参数及会话密钥 `AUTH_SESSION_SECRET`；不要提交实际凭据。`npm run audit:schema` 在有授权的测试数据库连接时核查现有结构。本版本不自动迁移数据库。

## 更新与验收

更新前阅读 [1.0 更新与回滚说明](docs/DEPLOY-1.0.txt)。上传文件改用独立持久目录；先验证旧附件复制和链接，再替换程序。附件链接形式保持 `/uploads/...`。部署后需重新登录，密码重置会撤销旧会话。

上线前在独立测试库至少核验：100+200=300、禁止部分返回、混合入库与返回、签字锁定、双页面设备列表冲突、现场 A/B 交叉权限、附件补传、旧附件访问，以及更新与回滚。

框架升级至 Next.js 16.3.8；官方安全说明见 [Windows 托管漏洞公告](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)。实际验证记录见 [1.0 验证记录](docs/VALIDATION-1.0.txt)。
