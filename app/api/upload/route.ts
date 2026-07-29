/**
 * 文件上传 API
 * 
 * POST /api/upload
 * 
 * 功能：
 * - 上传签字凭证、设备照片等文件
 * - 文件大小和类型验证
 * - 安全的文件名处理
 * - 返回文件访问路径
 * 
 * 遵守 .cursorrules 规范：
 * - 权限校验在第一行
 * - 返回结构化对象
 */

import { NextResponse } from "next/server";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils";

// ==================== 配置常量 ====================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIME_TO_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/jpg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

const ALLOWED_UPLOAD_TYPES = new Set([
  "signature",
  "device_photo",
  "damage_photo",
  "stamp_attachment",
]);

// ==================== 辅助函数 ====================

/**
 * 从 Cookie 获取当前登录用户
 */
/**
 * 生成安全的文件名
 */
function generateSafeFilename(extension: string, userId: string): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${userId}_${timestamp}_${randomString}.${extension}`;
}

/**
 * 生成文件存储路径（按年月分目录）
 */
function generateStoragePath(subDir: string, filename: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${subDir}/${year}/${month}/${filename}`;
}

// ==================== 主 API 处理函数 ====================

/**
 * POST /api/upload
 * 上传文件
 */
export async function POST(request: Request) {
  const authResult = await checkUserRole(ALL_USER_ROLES);
  if (isErrorResponse(authResult)) return authResult;

  try {
    // ==================== 1. 权限校验（第一行，遵守 cursorrules） ====================

    // ==================== 2. 解析 FormData ====================

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const ticketId = formData.get("ticketId") as string | null;
    const uploadType = formData.get("type");

    if (!file) {
      return NextResponse.json(
        { success: false, message: "未选择文件" },
        { status: 400 }
      );
    }

    if (typeof uploadType !== "string" || !ALLOWED_UPLOAD_TYPES.has(uploadType)) {
      return NextResponse.json(
        { success: false, message: "上传用途无效" },
        { status: 400 }
      );
    }

    if (ticketId !== null && (typeof ticketId !== "string" || ticketId.length > 100)) {
      return NextResponse.json(
        { success: false, message: "工单标识无效" },
        { status: 400 }
      );
    }

    // ==================== 3. 文件验证 ====================

    // 3.1 检查文件大小
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`,
        },
        { status: 400 }
      );
    }

    // 3.2 检查文件类型
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedExtensions = MIME_TO_EXTENSIONS[file.type];
    const isPdfAllowed = uploadType === "signature" || uploadType === "stamp_attachment";
    if (
      !allowedExtensions?.includes(extension) ||
      (file.type === "application/pdf" && !isPdfAllowed)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `不支持的文件类型：${file.type}（仅支持 JPG、PNG、WebP、PDF）`,
        },
        { status: 400 }
      );
    }

    // ==================== 4. 保存文件 ====================

    // 4.1 根据上传类型确定子目录
    const subDir = uploadType === "signature" ? "signatures" : "photos";

    // 4.2 生成安全的文件名
    const safeFilename = generateSafeFilename(extension, authResult.userId);

    // 4.3 生成存储路径（按年月分目录，如 photos/2026/03/xxx.jpg）
    const storagePath = generateStoragePath(subDir, safeFilename);

    // 4.4 使用存储适配器上传（支持 S3 和本地存储）
    const storage = getStorageAdapter();
    const fileUrl = await storage.upload(storagePath, file, file.type);

    // ==================== 5. 返回成功结果 ====================

    return NextResponse.json({
      success: true,
      message: "文件上传成功",
      data: {
        fileName: safeFilename,
        originalName: file.name,
        filePath: fileUrl, // 返回完整 URL（S3）或相对路径（本地）
        fileSize: file.size,
        mimeType: file.type,
        uploadType: uploadType || "unknown",
        ticketId: ticketId || null,
        uploadedBy: {
          id: authResult.userId,
          name: authResult.username,
        },
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error("[Upload API] 文件上传失败:", error);

    return NextResponse.json(
      {
        success: false,
        message: "文件上传失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
