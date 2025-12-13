import type { SystemEventName, SystemEventPayload } from "@repo/types"
import type { Broadcaster } from "./Broadcaster"

/**
 * BroadcasterRegistry
 *
 * Manages a collection of Broadcasters and dispatches system events to all of them.
 * This provides a central point for registering new broadcasters and ensures
 * all events are delivered to all registered consumers.
 *
 * @example
 * ```typescript
 * const registry = new BroadcasterRegistry()
 * registry.register(new RoomBroadcaster(io))
 * registry.register(new LobbyBroadcaster(io))
 *
 * // Later, in SystemEvents:
 * registry.broadcast(roomId, "TRACK_CHANGED", data)
 * ```
 */
export class BroadcasterRegistry {
  private readonly broadcasters: Map<string, Broadcaster> = new Map()

  /**
   * Register a broadcaster
   * @param broadcaster The broadcaster to register
   * @throws Error if a broadcaster with the same name is already registered
   */
  register(broadcaster: Broadcaster): void {
    if (this.broadcasters.has(broadcaster.name)) {
      throw new Error(`Broadcaster "${broadcaster.name}" is already registered`)
    }
    this.broadcasters.set(broadcaster.name, broadcaster)
    console.log(`[BroadcasterRegistry] Registered: ${broadcaster.name}`)
  }

  /**
   * Unregister a broadcaster by name
   */
  unregister(name: string): boolean {
    const removed = this.broadcasters.delete(name)
    if (removed) {
      console.log(`[BroadcasterRegistry] Unregistered: ${name}`)
    }
    return removed
  }

  /**
   * Broadcast an event to all registered broadcasters
   * Each broadcaster decides whether and how to handle the event
   */
  broadcast<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    for (const broadcaster of this.broadcasters.values()) {
      try {
        broadcaster.handleEvent(roomId, event, data)
      } catch (error) {
        console.error(
          `[BroadcasterRegistry] Error in broadcaster "${broadcaster.name}" for event "${event}":`,
          error,
        )
        // Continue to other broadcasters even if one fails
      }
    }
  }

  /**
   * Get a list of registered broadcaster names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.broadcasters.keys())
  }
}
