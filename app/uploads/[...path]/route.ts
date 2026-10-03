import { serveLocalUpload } from "@/lib/storage/serve-local-upload"

// Business-approved public sharing: only the exact link is public, never a directory listing.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return serveLocalUpload((await params).path)
}
