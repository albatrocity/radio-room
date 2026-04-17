import type { User } from "@repo/types/User"
import type { QueueItem } from "@repo/types/Queue"

/** Online room users overwrite history for the same userId (freshest name wins). */
export function buildUserDisplayNameLookup(users: User[], userHistory: User[]): Map<string, User> {
  const byId = new Map<string, User>()
  for (const u of userHistory) {
    if (u.userId) {
      byId.set(u.userId, u)
    }
  }
  for (const u of users) {
    if (u.userId) {
      byId.set(u.userId, u)
    }
  }
  return byId
}

/**
 * Resolve the best display name for export / markdown: current name from lookup, then snapshot on the item.
 */
export function resolveAddedByDisplayName(
  item: Pick<QueueItem, "addedBy">,
  lookup: Map<string, User>,
): string {
  const uid = item.addedBy?.userId
  const snapshot = item.addedBy?.username?.trim()
  if (!uid) {
    return snapshot || "Unknown"
  }
  const fromLookup = lookup.get(uid)?.username?.trim()
  return fromLookup || snapshot || `User ${uid.slice(0, 8)}`
}

/** Merge enriched `addedBy.username` onto playlist/queue rows for JSON export parity with Markdown. */
export function enrichQueueItemsForExport(items: QueueItem[], lookup: Map<string, User>): QueueItem[] {
  return items.map((item) => {
    if (!item.addedBy) return item
    return {
      ...item,
      addedBy: {
        ...item.addedBy,
        username: resolveAddedByDisplayName(item, lookup),
      },
    }
  })
}
