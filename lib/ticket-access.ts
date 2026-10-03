import { UserRole } from "@/lib/enums"

export interface TicketViewer {
  normalizedRole: UserRole
  userId: string | number
}

export interface TicketOwner {
  ReportByUserID: number | null
}

/** Batch resources (chat, attachments, history) include every device in a batch. */
export function canReadTicketBatch(viewer: TicketViewer, owners: readonly TicketOwner[]): boolean {
  if (owners.length === 0) return false
  if (viewer.normalizedRole !== UserRole.REPORTER) {
    return [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.WAREHOUSE, UserRole.BUSINESS]
      .includes(viewer.normalizedRole)
  }
  const userId = Number(viewer.userId)
  return Number.isSafeInteger(userId) && userId > 0 &&
    owners.every((owner) => owner.ReportByUserID === userId)
}
