/**
 * S3 兼容对象存储客户端
 * 
 * 使用标准 AWS S3 API，兼容：
 * - 阿里云 OSS
 * - 腾讯云 COS
 * - AWS S3
 * - 其他 S3 兼容服务
 * 
 * 严格遵守架构规范：
 * - 使用 @aws-sdk/client-s3（标准 S3 协议）
 * - 支持流式上传，避免内存溢出
 * - 环境变量使用 zod 严格校验
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { Readable } from "stream";

// ==================== 环境变量校验 ====================

const S3ConfigSchema = z.object({
  S3_ENDPOINT: z.string().url("S3_ENDPOINT 必须是有效的 URL"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID 不能为空"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY 不能为空"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET 不能为空"),
  S3_REGION: z.string().optional(), // 某些服务可能不需要 region
});

type S3Config = z.infer<typeof S3ConfigSchema>;

/**
 * 验证并获取 S3 配置
 * 在模块加载时立即验证，确保启动时发现配置错误
 */
function getS3Config(): S3Config {
  const rawConfig = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
  };

  try {
    return S3ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors.map((e) => e.path.join(".")).join(", ");
      throw new Error(
        `❌ S3 配置验证失败，缺少或无效的环境变量: ${missingFields}\n` +
        `请检查 .env.local 文件中的 S3 相关配置。`
      );
    }
    throw error;
  }
}

// ==================== S3 客户端封装 ====================

export class S3StorageClient {
  private client: S3Client;
  private bucket: string;
  private endpoint: string;

  constructor() {
    const config = getS3Config();

    // 初始化 S3 客户端
    // 注意：阿里云 OSS 等需要设置 forcePathStyle: true
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION || "us-east-1", // 默认 region，某些服务可能不需要
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      // 兼容阿里云 OSS、腾讯云 COS 等
      forcePathStyle: true, // 使用路径风格：bucket.s3.amazonaws.com/key
    });

    this.bucket = config.S3_BUCKET;
    this.endpoint = config.S3_ENDPOINT;
  }

  /**
   * 上传文件到 S3
   * 
   * @param key S3 对象键（路径），如 'photos/2026/03/xxx.jpg'
   * @param data 文件数据（支持多种类型，避免强制使用 Buffer）
   * @param contentType MIME 类型，如 'image/jpeg'
   * @returns 完整的公开访问 URL
   */
  async upload(
    key: string,
    data: Readable | Buffer | ArrayBuffer | Uint8Array | string,
    contentType?: string
  ): Promise<string> {
    // 将不同数据类型转换为 Body（S3 SDK 接受的类型）
    let body: Readable | Buffer | Uint8Array;

    if (data instanceof Readable) {
      // 已经是流，直接使用（最优，内存友好）
      body = data;
    } else if (data instanceof Buffer) {
      // Buffer，直接使用
      body = data;
    } else if (data instanceof ArrayBuffer) {
      // ArrayBuffer，转换为 Uint8Array
      body = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      // Uint8Array，直接使用
      body = data;
    } else if (typeof data === "string") {
      // 字符串，转换为 Buffer（仅用于小文本，不推荐大文件）
      body = Buffer.from(data, "utf-8");
    } else {
      throw new Error(`不支持的数据类型: ${typeof data}`);
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      // 设置 ACL 为公开读（如果需要公开访问）
      // ACL: "public-read", // 某些服务可能不支持，需要单独配置 Bucket 策略
    });

    try {
      await this.client.send(command);
      // 返回完整的公开访问 URL
      return this.getPublicUrl(key);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.error(`[S3Client] 上传失败 [${key}]:`, errorMessage);
      throw new Error(`文件上传失败: ${errorMessage}`);
    }
  }

  /**
   * 删除 S3 对象
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.client.send(command);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.error(`[S3Client] 删除失败 [${key}]:`, errorMessage);
      throw new Error(`文件删除失败: ${errorMessage}`);
    }
  }

  /**
   * 获取公开访问 URL
   * 
   * @param key S3 对象键
   * @returns 完整的公开访问 URL
   */
  getPublicUrl(key: string): string {
    // 移除 endpoint 末尾的斜杠
    const baseUrl = this.endpoint.replace(/\/$/, "");
    // 移除 key 开头的斜杠
    const cleanKey = key.replace(/^\//, "");
    return `${baseUrl}/${this.bucket}/${cleanKey}`;
  }

  /**
   * 生成预签名 URL（用于临时访问私有对象）
   * 
   * @param key S3 对象键
   * @param expiresIn 过期时间（秒），默认 1 小时
   * @returns 预签名 URL
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.error(`[S3Client] 生成预签名 URL 失败 [${key}]:`, errorMessage);
      throw new Error(`生成预签名 URL 失败: ${errorMessage}`);
    }
  }
}
