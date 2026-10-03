import { readFile, realpath, stat } from "node:fs/promises"
import { extname, isAbsolute, relative, sep } from "node:path"
import { NextResponse } from "next/server"
import { getUploadReadDirectories } from "./upload-directory"
import { resolveLocalUploadPath } from "./storage-adapter"

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
}

export async function serveLocalUpload(segments: string[]): Promise<NextResponse> {
  if (!segments?.length || segments.some((part) => !/^[A-Za-z0-9._-]+$/.test(part) || part === "." || part === "..")) {
    return NextResponse.json({ success: false, message: "附件路径无效" }, { status: 400 })
  }
  const key = segments.join("/")
  const contentType = CONTENT_TYPES[extname(key).toLowerCase()]
  if (!contentType) return NextResponse.json({ success: false, message: "不支持的附件类型" }, { status: 400 })
  try {
    for (const directory of getUploadReadDirectories()) {
      const candidate = resolveLocalUploadPath(directory, key)
      const info = await stat(candidate).catch(() => null)
      if (!info?.isFile()) continue
      const [base, filename] = await Promise.all([realpath(directory), realpath(candidate)])
      const inside = relative(base, filename)
      if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) continue
      const contents = await readFile(filename)
      return new NextResponse(new Uint8Array(contents), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'",
          "Content-Disposition": `inline; filename="${segments[segments.length - 1]}"`,
        },
      })
    }
    return NextResponse.json({ success: false, message: "附件不存在" }, { status: 404 })
  } catch (error: unknown) {
    console.error("[Uploads] 读取附件失败", error)
    return NextResponse.json({ success: false, message: "读取附件失败" }, { status: 500 })
  }
}
