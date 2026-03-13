# 📋 存储环境变量配置指南

## 开发环境（本地存储）

在 `.env.local` 文件中配置：

```env
STORAGE_MODE=local
UPLOAD_DIR=D:\MY app\axiom-repair\public\uploads
```

## 生产环境（S3 对象存储）

在 `.env.local` 或 Vercel 环境变量中配置：

```env
# 存储模式：'s3' 或 'oss' 使用对象存储，'local' 使用本地文件系统
STORAGE_MODE=s3

# S3 兼容服务配置（阿里云 OSS / 腾讯云 COS / AWS S3）
S3_ENDPOINT=https://your-bucket.oss-cn-shanghai.aliyuncs.com
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET=your-bucket-name
S3_REGION=oss-cn-shanghai
```

## 阿里云 OSS 配置示例

1. **创建 Bucket**:
   - 登录阿里云控制台
   - 创建 OSS Bucket（如 `axiom-repair-photos`）
   - 选择地域（如 `华东1（杭州）`）

2. **获取 AccessKey**:
   - 访问 RAM 访问控制
   - 创建用户并授予 OSS 读写权限
   - 获取 AccessKey ID 和 AccessKey Secret

3. **配置 Bucket 策略**（公开读）:
   ```json
   {
     "Version": "1",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "oss:GetObject",
         "Resource": "acs:oss:*:*:axiom-repair-photos/*"
       }
     ]
   }
   ```

4. **环境变量配置**:
   ```env
   STORAGE_MODE=s3
   S3_ENDPOINT=https://axiom-repair-photos.oss-cn-hangzhou.aliyuncs.com
   S3_ACCESS_KEY_ID=LTAI5txxxxxxxxxxxxx
   S3_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   S3_BUCKET=axiom-repair-photos
   S3_REGION=oss-cn-hangzhou
   ```

## 腾讯云 COS 配置示例

```env
STORAGE_MODE=s3
S3_ENDPOINT=https://cos.ap-shanghai.myqcloud.com
S3_ACCESS_KEY_ID=AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_BUCKET=axiom-repair-photos-1234567890
S3_REGION=ap-shanghai
```

## AWS S3 配置示例

```env
STORAGE_MODE=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_BUCKET=axiom-repair-photos
S3_REGION=us-east-1
```

## 验证配置

启动应用时，如果配置错误，会在控制台看到明确的错误信息：

```
❌ S3 配置验证失败，缺少或无效的环境变量: S3_ENDPOINT, S3_ACCESS_KEY_ID
请检查 .env.local 文件中的 S3 相关配置。
```

## 安全提示

⚠️ **不要将 `.env.local` 文件提交到代码库！**

- 使用 `.gitignore` 排除 `.env.local`
- 生产环境使用 Vercel/环境变量管理工具
- AccessKey Secret 是敏感信息，妥善保管
