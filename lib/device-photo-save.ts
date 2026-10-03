export interface PhotoResponse {
  ok: boolean
  json(): Promise<unknown>
}

/** Failed uploads and failed metadata writes must never be presented as saved. */
export async function requirePhotoSaveSuccess(response: PhotoResponse): Promise<Record<string, unknown>> {
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok || !result || typeof result !== "object" || !("success" in result) || result.success !== true) {
    throw new Error("照片保存失败，请保留当前页面后重试")
  }
  return result as Record<string, unknown>
}

export async function collectDevicePhotoUrls<T>(
  existingUrls: readonly string[],
  files: readonly T[],
  upload: (file: T) => Promise<string>,
): Promise<string[]> {
  // [] explicitly clears all saved photos. A rejected upload rejects the entire save.
  return [...existingUrls.filter((url) => !url.startsWith("blob:")), ...await Promise.all(files.map(upload))]
}
