import type { NotificationSpec } from "../types/Notification"

const STORAGE_PREFIX = "notifications:"

function storageKey(roomId: string): string {
  return STORAGE_PREFIX + roomId
}

/** Persist only specs flagged `persist: true` (plugin-tab attention). */
export function loadPersistedNotifications(roomId: string | null): Record<string, NotificationSpec> {
  if (roomId == null || typeof sessionStorage === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(storageKey(roomId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const out: Record<string, NotificationSpec> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue
      const spec = value as NotificationSpec
      if (typeof spec.id === "string" && spec.persist) {
        out[id] = { ...spec, id }
      }
    }
    return out
  } catch {
    return {}
  }
}

export function savePersistedNotifications(
  roomId: string | null,
  items: Record<string, NotificationSpec>,
): void {
  if (roomId == null || typeof sessionStorage === "undefined") return
  const persistable: Record<string, NotificationSpec> = {}
  for (const [id, spec] of Object.entries(items)) {
    if (spec.persist) persistable[id] = spec
  }
  if (Object.keys(persistable).length === 0) {
    sessionStorage.removeItem(storageKey(roomId))
    return
  }
  sessionStorage.setItem(storageKey(roomId), JSON.stringify(persistable))
}
