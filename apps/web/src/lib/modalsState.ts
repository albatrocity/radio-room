/**
 * Match helpers for the parallel `modalsMachine` (ADR 0128).
 *
 * Region paths (`modal.gameState`, `queue.open`) stay in one place so UI can
 * keep asking for the logical surface name (`"gameState"`, `"queue"`).
 */
import type { SnapshotFrom } from "xstate"

import type { modalsMachine } from "../machines/modalsMachine"

export type ModalsSnapshot = SnapshotFrom<typeof modalsMachine>

export function matchesModals(state: ModalsSnapshot, path: string): boolean {
  if (path === "queue" || path === "queue.open") {
    return state.matches("queue.open")
  }
  return state.matches(`modal.${path}` as "modal")
}

export function isModalsIdle(state: ModalsSnapshot): boolean {
  return state.matches({ modal: "closed", queue: "closed" })
}
