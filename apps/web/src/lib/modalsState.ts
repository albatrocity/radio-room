/**
 * Match helpers for the parallel `modalsMachine` (ADR 0128 / 0146 / 0177).
 *
 * Region paths (`modal.gameState`, `queue.open`, `feedback.open`, `whatsNew.open`, `help.open`)
 * stay in one place so UI can keep asking for the logical surface name
 * (`"gameState"`, `"queue"`, `"feedback"`, `"whatsNew"`, `"help"`).
 */
import type { SnapshotFrom } from "xstate"

import type { modalsMachine } from "../machines/modalsMachine"

export type ModalsSnapshot = SnapshotFrom<typeof modalsMachine>

export function matchesModals(state: ModalsSnapshot, path: string): boolean {
  if (path === "queue" || path === "queue.open") {
    return state.matches("queue.open")
  }
  if (path === "feedback" || path === "feedback.open") {
    return state.matches("feedback.open")
  }
  if (path === "whatsNew" || path === "whatsNew.open") {
    return state.matches("whatsNew.open")
  }
  if (path === "help" || path === "help.open") {
    return state.matches("help.open")
  }
  return state.matches(`modal.${path}` as "modal")
}

export function isModalsIdle(state: ModalsSnapshot): boolean {
  return state.matches({
    modal: "closed",
    queue: "closed",
    feedback: "closed",
    whatsNew: "closed",
    help: "closed",
  })
}
