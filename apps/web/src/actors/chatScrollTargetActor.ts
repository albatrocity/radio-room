/**
 * Chat scroll target actor
 *
 * Carries one-shot intent to scroll the main chat viewport to a message by timestamp.
 */

import { createActor } from "xstate"
import type { ActorRefFrom } from "xstate"

import { chatScrollTargetMachine } from "../machines/chatScrollTargetMachine"

export const chatScrollTargetActor: ActorRefFrom<typeof chatScrollTargetMachine> =
  createActor(chatScrollTargetMachine).start()
