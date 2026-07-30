import { NextResponse } from "next/server"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { getStorageAdapter } from "@/lib/storage/storage-adapter"
import {
  createUploadStoragePath,
  validateUploadedFile,
  type UploadPurpose,
} from "@/lib/storage/upload-security"

const ALLOWED_UPLOAD_TYPES: ReadonlySet<UploadPurpose> = new Set([
  "signature",
  "device_photo",
  "damage_photo",
  "stamp_attachment",
])

/**
 * POST /api/upload
 * 通用安全上传入口。业务接口仍需在自己的事务中保存文件关联关系。
 */
export async function POST(request: Request) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const ticketId = formData.get("ticketId")
    const uploadType = formData.get("type")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "未选择文件" },
        { status: 400 }
      )
    }
    if (
      typeof uploadType !== "string" ||
      !ALLOWED_UPLOAD_TYPES.has(uploadType as UploadPurpose)
    ) {
      return NextResponse.json(
        { success: false, message: "上传用途无效" },
        { status: 400 }
      )
    }
    if (ticketId !== null && (typeof ticketId !== "string" || ticketId.length > 100)) {
      return NextResponse.json(
        { success: false, message: "工单标识无效" },
        { status: 400 }
      )
    }

    const purpose = uploadType as UploadPurpose
    const validation = await validateUploadedFile(file, purpose)
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: validation.message },
        { status: 400 }
      )
    }

    const storagePath = createUploadStoragePath(
      purpose,
      authResult.userId,
      validation.extension
    )
    const safeFilename = storagePath.split("/").pop() || "attachment"
    const filePath = await getStorageAdapter().upload(
      storagePath,
      file,
      validation.mimeType
    )

    return NextResponse.json({
      success: true,
      message: "文件上传成功",
      data: {
        fileName: safeFilename,
        originalName: validation.originalName,
        filePath,
        fileSize: file.size,
        mimeType: validation.mimeType,
        uploadType: purpose,
        ticketId: ticketId || null,
        uploadedBy: {
          id: authResult.userId,
          name: authResult.username,
        },
        uploadedAt: new Date().toISOString(),
      },
    })
  } catch (error: unknown) {
    console.error("[Upload API] 文件上传失败:", error)
    return NextResponse.json(
      { success: false, message: "文件上传失败，请稍后重试" },
      { status: 500 }
    )
  }
}
