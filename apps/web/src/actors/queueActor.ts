/**
 * Queue-add actor. Lives for the app lifetime so SONG_QUEUED can still toast
 * after Game State item detail unmounts (Poor Physical Media conversion
 * removes the record that owned that view).
 */

import { createActor } from "xstate"
import { QUEUE_EVENT_TYPES, queueMachine } from "../machines/queueMachine"
import { subscribeActor } from "./socketActor"

export const queueActor = createActor(queueMachine).start()

subscribeActor(queueActor, QUEUE_EVENT_TYPES)
