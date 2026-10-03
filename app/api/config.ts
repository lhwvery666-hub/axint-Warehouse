import { getUploadDirectory } from "@/lib/storage/upload-directory"

// Legacy routes use the same persistent directory as the storage adapter.
export const UPLOAD_DIR = getUploadDirectory()
