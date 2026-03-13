/**
 * 图片 URL 处理工具
 * 
 * 数据库"零改动"兼容策略：
 * - 旧数据：相对路径 `/uploads/photos/xxx.jpg`
 * - 新数据：完整 URL `https://bucket.oss-cn-shanghai.aliyuncs.com/photos/xxx.jpg`
 * 
 * 前端统一处理函数，自动判断并补齐 URL
 */

/**
 * 规范化图片 URL
 * 
 * @param url 图片 URL（可能是相对路径或完整 URL）
 * @param baseUrl 基础 URL（开发环境或测试环境域名，可选）
 * @returns 完整的可访问 URL
 * 
 * @example
 * normalizeImageUrl('/uploads/photos/xxx.jpg') 
 * // => 'http://localhost:3000/uploads/photos/xxx.jpg' (开发环境)
 * 
 * normalizeImageUrl('https://bucket.oss-cn-shanghai.aliyuncs.com/photos/xxx.jpg')
 * // => 'https://bucket.oss-cn-shanghai.aliyuncs.com/photos/xxx.jpg' (直接返回)
 */
export function normalizeImageUrl(url: string | null | undefined, baseUrl?: string): string {
  if (!url) {
    return "";
  }

  // 如果已经是完整 URL（http/https），直接返回
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // 如果是相对路径（以 / 开头），补齐基础 URL
  if (url.startsWith("/")) {
    // 使用传入的 baseUrl，或从环境变量获取，或使用当前域名
    const base = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "";
    
    if (base) {
      // 移除 base 末尾的斜杠，移除 url 开头的斜杠，然后拼接
      const cleanBase = base.replace(/\/$/, "");
      const cleanUrl = url.replace(/^\//, "");
      return `${cleanBase}/${cleanUrl}`;
    }

    // 如果没有 baseUrl，在客户端环境使用 window.location.origin
    if (typeof window !== "undefined") {
      return `${window.location.origin}${url}`;
    }

    // 服务端环境，返回相对路径（由 Next.js 处理）
    return url;
  }

  // 其他情况，直接返回
  return url;
}

/**
 * 批量规范化图片 URL 数组
 * 
 * @param urls 图片 URL 数组（可能是 JSON 字符串或数组）
 * @param baseUrl 基础 URL（可选）
 * @returns 规范化后的 URL 数组
 */
export function normalizeImageUrls(
  urls: string | string[] | null | undefined,
  baseUrl?: string
): string[] {
  if (!urls) {
    return [];
  }

  // 如果是 JSON 字符串，先解析
  let urlArray: string[];
  if (typeof urls === "string") {
    try {
      urlArray = JSON.parse(urls);
    } catch {
      // 解析失败，当作单个 URL 处理
      urlArray = [urls];
    }
  } else {
    urlArray = urls;
  }

  // 过滤空值并规范化
  return urlArray
    .filter((url): url is string => Boolean(url))
    .map((url) => normalizeImageUrl(url, baseUrl));
}

/**
 * 从图片 URL 中提取文件名
 * 
 * @param url 图片 URL
 * @returns 文件名
 */
export function extractFilenameFromUrl(url: string): string {
  if (!url) {
    return "";
  }

  try {
    // 如果是完整 URL，使用 URL 对象解析
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split("/").pop() || "";
      return filename;
    }

    // 如果是相对路径，直接提取文件名
    const filename = url.split("/").pop() || "";
    return filename;
  } catch {
    // 解析失败，返回原值
    return url;
  }
}
