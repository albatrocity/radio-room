/**
 * Game State Nav Actor
 *
 * Active tab + per-tab item detail stack for the Game State overlay (ADR 0106, 0130).
 * ACTIVATE / DEACTIVATE come from `modalsMachine` `gameState` entry/exit; roomLifecycle
 * sends RESET on room exit so no frame outlives the room it came from.
 */

import { createActor } from "xstate"
import { gameStateNavMachine } from "../machines/gameStateNavMachine"
import { bindGameStateNavInventorySink } from "../lib/gameStateNavInventory"
import { bindGameStateNavSessionSink } from "../lib/gameStateNavSession"

export const gameStateNavActor = createActor(gameStateNavMachine).start()

bindGameStateNavSessionSink((snapshot) => {
  gameStateNavActor.send({ type: "SESSION_SNAPSHOT", ...snapshot })
})

bindGameStateNavInventorySink((notice) => {
  if (notice.type === "drop") {
    gameStateNavActor.send({ type: "DROP_INVENTORY_DETAIL", itemId: notice.itemId })
    return
  }
  gameStateNavActor.send({ type: "RECONCILE_INVENTORY_DETAILS", heldItemIds: [...notice.itemIds] })
})
