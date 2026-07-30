import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { normalizeStorageKey, resolveLocalUploadPath } from "../storage/storage-adapter"
import {
  createUploadStoragePath,
  sanitizeOriginalFilename,
  validateUploadedFile,
} from "../storage/upload-security"

test("安全上传接受扩展名、MIME 与文件签名一致的 PNG", async () => {
  const png = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
    "signature.png",
    { type: "image/png" }
  )
  const result = await validateUploadedFile(png, "signature")
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.extension, "png")
    assert.equal(result.mimeType, "image/png")
  }
})

test("安全上传拒绝伪造 MIME 的文件", async () => {
  const spoofed = new File(["not-a-png"], "signature.png", { type: "image/png" })
  const result = await validateUploadedFile(spoofed, "signature")
  assert.deepEqual(result, { success: false, message: "文件内容签名与声明类型不一致" })
})

test("存储路径拒绝编码穿越、远程 URL 和绝对路径", () => {
  const baseDir = join(tmpdir(), "upload-boundary-test")
  assert.throws(() => normalizeStorageKey("/uploads/photos/%2e%2e/secret.jpg"))
  assert.throws(() => resolveLocalUploadPath(baseDir, "https://example.com/file.jpg"))
  assert.throws(() => resolveLocalUploadPath(baseDir, "C:/Windows/system.ini"))
  assert.match(
    resolveLocalUploadPath(baseDir, "/uploads/photos/2026/07/safe.jpg"),
    /photos[\\/]2026[\\/]07[\\/]safe\.jpg$/
  )
})

test("服务端文件名不保留客户端路径", () => {
  assert.equal(sanitizeOriginalFilename("../../客户签字.png"), "客户签字.png")
  assert.match(
    createUploadStoragePath("stamp_attachment", "4", "pdf"),
    /^stamp-attachments\/\d{4}\/\d{2}\/4_\d+_[0-9a-f-]+\.pdf$/
  )
})
