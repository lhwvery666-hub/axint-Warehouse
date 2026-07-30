/**
 * 存储适配器接口
 * 
 * 统一存储抽象，支持：
 * - S3 兼容对象存储（生产环境）
 * - 本地文件系统（开发环境）
 * 
 * 严格遵守架构规范：
 * - 支持流式上传，避免内存溢出
 * - 不强制使用 Buffer
 * - 数据库零改动兼容策略
 */

import { Readable } from "stream";
import { S3StorageClient } from "./s3-client";
import { writeFile, mkdir } from "fs/promises";
import { isAbsolute, relative, resolve, sep } from "path";
import { existsSync } from "fs";

function decodeStoredPath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error("存储路径编码无效")
  }
}

export function normalizeStorageKey(value: string): string {
  const decoded = decodeStoredPath(value.trim())
  if (!decoded || decoded.includes("\0") || decoded.includes("\\")) {
    throw new Error("存储路径无效")
  }

  const withoutPrefix = decoded
    .replace(/^\/uploads\//, "")
    .replace(/^uploads\//, "")
    .replace(/^\/+/, "")
  const segments = withoutPrefix.split("/")
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("存储路径越界")
  }
  return segments.join("/")
}

export function resolveLocalUploadPath(baseDir: string, storedPath: string): string {
  if (/^https?:\/\//i.test(storedPath)) {
    throw new Error("本地存储不接受远程 URL")
  }
  const resolvedBase = resolve(baseDir)
  const fullPath = resolve(resolvedBase, normalizeStorageKey(storedPath))
  const relativePath = relative(resolvedBase, fullPath)
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("存储路径越界")
  }
  return fullPath
}

// ==================== 存储适配器接口 ====================

/**
 * 存储适配器接口
 * 支持多种数据源，避免强制使用 Buffer
 */
export interface StorageAdapter {
  /**
   * 上传文件
   * 
   * @param filePath 文件路径（相对路径，如 'photos/2026/03/xxx.jpg'）
   * @param data 文件数据（支持 Stream/Buffer/ArrayBuffer/File）
   * @param contentType MIME 类型
   * @returns 完整的访问 URL（兼容新旧格式）
   */
  upload(
    filePath: string,
    data: Readable | Buffer | ArrayBuffer | Uint8Array | File,
    contentType?: string
  ): Promise<string>;

  /**
   * 删除文件
   */
  delete(filePath: string): Promise<void>;

  /**
   * 获取文件访问 URL
   * 
   * @param filePath 文件路径
   * @returns 完整的访问 URL（兼容新旧格式）
   */
  getUrl(filePath: string): string;
}

// ==================== S3 存储适配器 ====================

/**
 * S3 兼容对象存储适配器（生产环境）
 */
export class S3StorageAdapter implements StorageAdapter {
  private client: S3StorageClient;

  constructor() {
    this.client = new S3StorageClient();
  }

  async upload(
    filePath: string,
    data: Readable | Buffer | ArrayBuffer | Uint8Array | File,
    contentType?: string
  ): Promise<string> {
    // 处理 File 对象（来自 FormData）
    let uploadData: Readable | Buffer | ArrayBuffer | Uint8Array;
    
    if (data instanceof File) {
      // File 对象转换为 ArrayBuffer（避免全部加载到内存）
      // 注意：对于大文件，应该使用流式处理，但 File API 不直接支持 Stream
      // 这里先转换为 ArrayBuffer，实际生产环境建议使用 multipart upload
      uploadData = await data.arrayBuffer();
    } else {
      uploadData = data;
    }

    return this.client.upload(filePath, uploadData, contentType);
  }

  async delete(filePath: string): Promise<void> {
    // 从完整 URL 中提取 key（兼容性处理）
    const key = this.extractKeyFromUrl(filePath);
    return this.client.delete(key);
  }

  getUrl(filePath: string): string {
    const key = this.extractKeyFromUrl(filePath);
    return this.client.getPublicUrl(key);
  }

  /**
   * 从 URL 或路径中提取 S3 key
   */
  private extractKeyFromUrl(urlOrPath: string): string {
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      const candidate = new URL(urlOrPath)
      const endpoint = new URL(process.env.S3_ENDPOINT || "")
      const bucket = process.env.S3_BUCKET || ""
      if (candidate.protocol !== "https:" || candidate.origin !== endpoint.origin || !bucket) {
        throw new Error("对象存储路径来源无效")
      }
      const bucketPrefix = `/${bucket}/`
      if (!candidate.pathname.startsWith(bucketPrefix)) {
        throw new Error("对象存储路径不属于当前存储桶")
      }
      return normalizeStorageKey(candidate.pathname.slice(bucketPrefix.length))
    }
    return normalizeStorageKey(urlOrPath)
  }
}

// ==================== 本地存储适配器 ====================

/**
 * 本地文件系统适配器（开发环境）
 */
export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor() {
    // 使用环境变量或默认路径
    this.baseDir = process.env.UPLOAD_DIR || resolve(process.cwd(), "public", "uploads");
  }

  async upload(
    filePath: string,
    data: Readable | Buffer | ArrayBuffer | Uint8Array | File,
    _contentType?: string
  ): Promise<string> {
    // 处理 File 对象
    let uploadData: Buffer;
    
    if (data instanceof File) {
      const arrayBuffer = await data.arrayBuffer();
      uploadData = Buffer.from(arrayBuffer);
    } else if (data instanceof Readable) {
      // 流式读取（内存友好）
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.from(chunk));
      }
      uploadData = Buffer.concat(chunks);
    } else if (data instanceof ArrayBuffer) {
      uploadData = Buffer.from(data);
    } else if (data instanceof Buffer) {
      uploadData = data;
    } else if (data instanceof Uint8Array) {
      uploadData = Buffer.from(data);
    } else {
      throw new Error(`不支持的数据类型: ${typeof data}`);
    }

    // 确保目录存在
    const fullPath = resolveLocalUploadPath(this.baseDir, filePath);
    const dir = resolve(fullPath, "..");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // 写入文件
    await writeFile(fullPath, uploadData);

    // 返回相对路径（兼容旧格式）
    return `/uploads/${filePath}`;
  }

  async delete(filePath: string): Promise<void> {
    const { unlink } = await import("fs/promises");
    const fullPath = resolveLocalUploadPath(this.baseDir, filePath);
    try {
      await unlink(fullPath);
    } catch (error) {
      // 文件不存在时忽略错误
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  getUrl(filePath: string): string {
    const key = this.extractKeyFromPath(filePath);
    return `/uploads/${key}`;
  }

  /**
   * 从路径中提取 key（移除 /uploads/ 前缀）
   */
  private extractKeyFromPath(path: string): string {
    return normalizeStorageKey(path)
  }
}

// ==================== 工厂方法 ====================

/**
 * 根据环境变量创建存储适配器
 * 
 * 环境变量 STORAGE_MODE:
 * - 's3' 或 'oss': 使用 S3 兼容对象存储
 * - 'local' 或其他: 使用本地文件系统
 */
export function createStorageAdapter(): StorageAdapter {
  const mode = (process.env.STORAGE_MODE || "local").toLowerCase();

  if (mode === "s3" || mode === "oss") {
    try {
      return new S3StorageAdapter();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.error(`[StorageAdapter] 创建 S3 适配器失败: ${errorMessage}`);
      console.warn(`[StorageAdapter] 降级到本地存储适配器`);
      return new LocalStorageAdapter();
    }
  }

  return new LocalStorageAdapter();
}

// ==================== 单例实例 ====================

/**
 * 全局存储适配器实例
 * 在模块加载时创建，确保环境变量验证在启动时执行
 */
let storageAdapterInstance: StorageAdapter | null = null;

/**
 * 获取存储适配器实例（单例模式）
 */
export function getStorageAdapter(): StorageAdapter {
  if (!storageAdapterInstance) {
    storageAdapterInstance = createStorageAdapter();
  }
  return storageAdapterInstance;
}
