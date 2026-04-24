/**
 * Chat Actor
 *
 * Singleton actor that manages chat messages state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { chatMachine } from "../machines/chatMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const chatActor = createActor(chatMachine).start()
