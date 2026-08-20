/**
 * Add to Queue UI Actor
 *
 * Room-scoped Search/Browse chrome + browse location (ADR 0105).
 * Send ACTIVATE { roomId } on room entry, DEACTIVATE on room exit (see roomLifecycle).
 */

import { createActor } from "xstate"
import { addToQueueUiMachine } from "../machines/addToQueueUiMachine"

export const addToQueueUiActor = createActor(addToQueueUiMachine).start()
