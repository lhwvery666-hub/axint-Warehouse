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
import { cookies } from "next/headers";
import { normalizeUserRole } from "@/lib/enums";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";

// ==================== 配置常量 ====================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

// ==================== 辅助函数 ====================

/**
 * 从 Cookie 获取当前登录用户
 */
async function getCurrentUser(cookieStore: ReturnType<typeof cookies>) {
  const userCookie = (await cookieStore).get("user");
  if (!userCookie?.value) {
    return null;
  }

  try {
    const user = JSON.parse(userCookie.value);
    const normalizedRole = normalizeUserRole(user.role);
    if (!normalizedRole) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: normalizedRole,
    };
  } catch {
    return null;
  }
}

/**
 * 生成安全的文件名
 */
function generateSafeFilename(originalName: string, userId: string): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split(".").pop() || "jpg";
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
  try {
    // ==================== 1. 权限校验（第一行，遵守 cursorrules） ====================

    const cookieStore = cookies();
    const currentUser = await getCurrentUser(cookieStore);

    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: "未登录或登录已过期" },
        { status: 401 }
      );
    }

    // ==================== 2. 解析 FormData ====================

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const ticketId = formData.get("ticketId") as string | null;
    const uploadType = formData.get("type") as string | null; // signature, device_photo, damage_photo

    if (!file) {
      return NextResponse.json(
        { success: false, message: "未选择文件" },
        { status: 400 }
      );
    }

    // ==================== 3. 文件验证 ====================

    // 3.1 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`,
        },
        { status: 400 }
      );
    }

    // 3.2 检查文件类型
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
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
    const safeFilename = generateSafeFilename(file.name, currentUser.id);

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
          id: currentUser.id,
          name: currentUser.username,
        },
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Upload API] 文件上传失败:", error);

    return NextResponse.json(
      {
        success: false,
        message: "文件上传失败，请稍后重试",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    );
  }
}
