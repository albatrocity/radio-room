import { pruneExpiredModifiers } from "@repo/game-logic"
import type { MockPluginLifecycle } from "./mockLifecycle"
import type { StudioRoom } from "./studioRoom"

export function tickExpiredModifiers(room: StudioRoom, lifecycle: MockPluginLifecycle): void {
  const session = room.activeSession
  if (!session) return
  const now = Date.now()
  for (const userId of room.participants) {
    const state = room.getUserState(userId)
    if (!state) continue
    const { active, expired } = pruneExpiredModifiers(state.modifiers, now)
    if (expired.length === 0) continue
    state.modifiers = active
    room.setUserState(state)
    for (const m of expired) {
      void lifecycle.emit("GAME_MODIFIER_REMOVED", {
        roomId: room.roomId,
        sessionId: session.id,
        userId,
        modifierId: m.id,
        reason: "expired",
      })
    }
  }
}
