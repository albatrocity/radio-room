/**
 * Game State Nav Actor
 *
 * Active tab + per-tab item detail stack for the Game State modal (ADR 0106).
 * ACTIVATE / DEACTIVATE follow the modal rather than the room; roomLifecycle
 * sends RESET on room exit so no frame outlives the room it came from.
 */

import { createActor } from "xstate"
import { gameStateNavMachine } from "../machines/gameStateNavMachine"

export const gameStateNavActor = createActor(gameStateNavMachine).start()
