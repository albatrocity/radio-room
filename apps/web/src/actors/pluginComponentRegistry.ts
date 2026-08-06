/**
 * Shared plugin component actors — one machine/subscription per pluginName per room.
 *
 * Avoids N× PluginArea rows each mounting useMachine(pluginComponentMachine).
 * Room teardown clears and stops all actors.
 */

import { createActor, type ActorRefFrom } from "xstate"
import { pluginComponentMachine } from "../machines/pluginComponentMachine"

export type PluginComponentActor = ActorRefFrom<typeof pluginComponentMachine>

const actors = new Map<string, PluginComponentActor>()

/**
 * Get or create the shared actor for a plugin. First `storeKeys` wins for the room lifetime.
 */
export function ensurePluginComponentActor(
  pluginName: string,
  storeKeys: string[],
): PluginComponentActor {
  const existing = actors.get(pluginName)
  if (existing) return existing

  const actor = createActor(pluginComponentMachine, {
    input: { pluginName, storeKeys },
  }).start()
  actors.set(pluginName, actor)
  return actor
}

export function getPluginComponentActor(pluginName: string): PluginComponentActor | undefined {
  return actors.get(pluginName)
}

/** Set roomId on every registered plugin actor (triggers fetch when newly set). */
export function setPluginComponentRoomId(roomId: string): void {
  for (const actor of actors.values()) {
    actor.send({ type: "SET_ROOM_ID", roomId })
  }
}

/** Reset and stop all plugin component actors (call from teardownRoom). */
export function teardownPluginComponentActors(): void {
  for (const actor of actors.values()) {
    actor.send({ type: "RESET" })
    actor.stop()
  }
  actors.clear()
}
