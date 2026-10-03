import { basename, dirname, isAbsolute, resolve } from "node:path"

/** Stable across source runs and .next/standalone/server.js releases. */
export function getApplicationRoot(cwd: string = process.cwd()): string {
  return basename(cwd) === "standalone" && basename(dirname(cwd)) === ".next"
    ? resolve(cwd, "..", "..") : resolve(cwd)
}

export function getUploadDirectory(cwd: string = process.cwd(), configured = process.env.UPLOAD_DIR): string {
  const root = getApplicationRoot(cwd)
  return configured ? (isAbsolute(configured) ? resolve(configured) : resolve(root, configured)) : resolve(root, "uploads")
}

/** Read old links during migration; new writes always use the persistent directory. */
export function getUploadReadDirectories(): string[] {
  return [...new Set([
    getUploadDirectory(),
    resolve(getApplicationRoot(), "public", "uploads"),
    resolve(process.cwd(), "public", "uploads"),
  ])]
}
