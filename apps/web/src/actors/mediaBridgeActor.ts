/**
 * Media Bridge Actor
 *
 * Room-scoped status for DJ Mac Media Bridge link (ADR 0080 / 0081).
 * Send ACTIVATE on room enter, DEACTIVATE on leave.
 */

import { createActor } from "xstate"
import { mediaBridgeMachine } from "../machines/mediaBridgeMachine"

export const mediaBridgeActor = createActor(mediaBridgeMachine).start()

export function linkMediaBridge(): void {
  mediaBridgeActor.send({ type: "LINK" })
}

export function isMediaBridgeConnected(): boolean {
  return mediaBridgeActor.getSnapshot().matches({ active: "connected" })
}
