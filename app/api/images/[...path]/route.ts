import { readFile, stat } from "node:fs/promises"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import { NextResponse } from "next/server"
import { UPLOAD_DIR } from "@/app/api/config"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const { path: segments } = await params
    if (
      !segments?.length ||
      segments.some(
        (segment) =>
          !/^[A-Za-z0-9._-]+$/.test(segment) ||
          segment === "." ||
          segment === ".."
      )
    ) {
      return NextResponse.json({ success: false, message: "图片路径无效" }, { status: 400 })
    }

    const baseDir = resolve(UPLOAD_DIR)
    const filePath = resolve(baseDir, ...segments)
    const relativePath = relative(baseDir, filePath)
    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      return NextResponse.json({ success: false, message: "图片路径越界" }, { status: 400 })
    }

    const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()]
    if (!contentType) {
      return NextResponse.json({ success: false, message: "不支持的图片类型" }, { status: 400 })
    }

    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat?.isFile()) {
      return NextResponse.json({ success: false, message: "图片不存在" }, { status: 404 })
    }
    const contents = await readFile(filePath)
    return new NextResponse(new Uint8Array(contents), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error: unknown) {
    console.error("[Images API] 读取图片失败:", error)
    return NextResponse.json({ success: false, message: "读取图片失败" }, { status: 500 })
  }
}
