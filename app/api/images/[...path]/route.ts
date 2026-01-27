import { NextResponse } from "next/server";
import { UPLOAD_DIR } from "@/app/api/config";
import * as fs from "fs";
import * as path from "path";

// GET /api/images/2026-01-20/uuid.jpg
export async function GET(
  request: Request,
  // 🟢 关键修改 1：这里要把 params 定义为 Promise
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // 🟢 关键修改 2：必须先 await params 才能拿到 path
    const { path: segments } = await params;

    console.log("🔍 [API] 请求图片路径参数:", segments);
    console.log("📂 [API] 根目录:", UPLOAD_DIR);

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { success: false, message: "缺少图片路径参数" },
        { status: 400 }
      );
    }

    // 防止路径穿越
    if (segments.some((seg) => seg.includes(".."))) {
      return NextResponse.json(
        { success: false, message: "非法路径" },
        { status: 400 }
      );
    }

    // 拼接物理路径 (Windows 下 path.join 会自动处理为反斜杠)
    const filePath = path.join(UPLOAD_DIR, ...segments);
    console.log("🎯 [API] 完整物理路径:", filePath);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.error("❌ [API] 文件未找到:", filePath);
      return NextResponse.json(
        { success: false, message: "图片不存在" },
        { status: 404 }
      );
    }

    // 简单判断 Content-Type
    const ext = path.extname(filePath).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";

    // 读取文件流
    const fileStream = fs.createReadStream(filePath);

    // 转换流格式
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new NextResponse(readableStream as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });

  } catch (error: any) {
    console.error("❌ [API] 读取图片失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "读取图片失败",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    );
  }
}