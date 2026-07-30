import { UserRole } from "@/lib/enums"

export function canAccessUserResource(
  requesterId: number,
  requesterRole: UserRole,
  targetUserId: number
): boolean {
  return requesterRole === UserRole.ADMIN || requesterId === targetUserId
}
