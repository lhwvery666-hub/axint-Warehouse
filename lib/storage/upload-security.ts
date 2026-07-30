import { randomUUID } from "node:crypto"

export const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024

export type UploadPurpose =
  | "signature"
  | "device_photo"
  | "damage_photo"
  | "stamp_attachment"

type SupportedMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"

interface UploadValidationSuccess {
  success: true
  extension: string
  mimeType: SupportedMimeType
  originalName: string
}

interface UploadValidationFailure {
  success: false
  message: string
}

export type UploadValidationResult = UploadValidationSuccess | UploadValidationFailure

const MIME_ALIASES: Readonly<Record<string, SupportedMimeType>> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "application/pdf": "application/pdf",
}

const MIME_TO_EXTENSIONS: Readonly<Record<SupportedMimeType, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
}

const PURPOSE_MIME_TYPES: Readonly<Record<UploadPurpose, ReadonlySet<SupportedMimeType>>> = {
  signature: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  device_photo: new Set(["image/jpeg", "image/png", "image/webp"]),
  damage_photo: new Set(["image/jpeg", "image/png", "image/webp"]),
  stamp_attachment: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
}

const PURPOSE_DIRECTORIES: Readonly<Record<UploadPurpose, string>> = {
  signature: "signatures",
  device_photo: "photos",
  damage_photo: "photos",
  stamp_attachment: "stamp-attachments",
}

function hasFileSignature(bytes: Uint8Array, mimeType: SupportedMimeType): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return signature.every((value, index) => bytes[index] === value)
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  }
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
}

export function sanitizeOriginalFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() || "attachment"
  const sanitized = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255)
  return sanitized || "attachment"
}

export async function validateUploadedFile(
  file: File,
  purpose: UploadPurpose
): Promise<UploadValidationResult> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_FILE_SIZE) {
    return { success: false, message: "文件为空或超过 10MB 限制" }
  }

  const mimeType = MIME_ALIASES[file.type.toLowerCase()]
  if (!mimeType || !PURPOSE_MIME_TYPES[purpose].has(mimeType)) {
    return { success: false, message: "文件 MIME 类型不符合上传用途" }
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || ""
  if (!MIME_TO_EXTENSIONS[mimeType].includes(extension)) {
    return { success: false, message: "文件扩展名与 MIME 类型不一致" }
  }

  const signatureBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (!hasFileSignature(signatureBytes, mimeType)) {
    return { success: false, message: "文件内容签名与声明类型不一致" }
  }

  return {
    success: true,
    extension,
    mimeType,
    originalName: sanitizeOriginalFilename(file.name),
  }
}

export function createUploadStoragePath(
  purpose: UploadPurpose,
  userId: string,
  extension: string
): string {
  if (!/^\d+$/.test(userId) || !/^[a-z0-9]+$/.test(extension)) {
    throw new Error("Invalid upload path input")
  }

  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${PURPOSE_DIRECTORIES[purpose]}/${year}/${month}/${userId}_${Date.now()}_${randomUUID()}.${extension}`
}
