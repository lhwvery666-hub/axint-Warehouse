import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { serveLocalUpload } from "@/lib/storage/serve-local-upload"

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult
  return serveLocalUpload((await params).path)
}
