import type { Room } from "@repo/types/Room"

export function applyQueueDisplayEverEnabledFlags(
  previous: Room,
  patch: Partial<Room>,
): Partial<Room> {
  const out = { ...patch }

  if (
    "showQueueCount" in patch &&
    patch.showQueueCount === false &&
    previous.showQueueCount !== false
  ) {
    out.showQueueCountEverEnabled = true
  }

  if (
    "showQueueTracks" in patch &&
    patch.showQueueTracks === false &&
    previous.showQueueTracks !== false
  ) {
    out.showQueueTracksEverEnabled = true
  }

  return out
}
