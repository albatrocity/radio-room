import { useSyncExternalStore } from "react"
import type { StudioRoom } from "../studio/studioRoom"

/** Subscribe to in-memory studio room mutations (same object identity; epoch drives re-renders). */
export function useStudioRoom(room: StudioRoom | null): StudioRoom | null {
  const epoch = useSyncExternalStore(
    (cb) => {
      if (!room) return () => {}
      return room.subscribe(cb)
    },
    () => room?.snapshotEpoch ?? 0,
    () => room?.snapshotEpoch ?? 0,
  )
  void epoch
  return room
}
