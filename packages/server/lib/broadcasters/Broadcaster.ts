import type { Server } from "socket.io"
import type { SystemEventName, SystemEventPayload } from "@repo/types"

/**
 * Broadcaster Interface
 *
 * Broadcasters are responsible for delivering system events to specific
 * socket channels. Each broadcaster controls:
 * - Which events it cares about
 * - How to transform event data for its consumers
 * - Which socket channel(s) to emit to
 *
 * This pattern separates event emission (SystemEvents) from event routing
 * and delivery (Broadcasters), making the system more extensible.
 */
export interface Broadcaster {
  /** Unique name for this broadcaster (for logging/debugging) */
  readonly name: string

  /**
   * Handle a system event
   * Called by BroadcasterRegistry for every event emitted by SystemEvents
   */
  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void
}

/**
 * Base class for broadcasters that emit to Socket.IO
 * Provides common functionality for socket-based broadcasters
 */
export abstract class SocketBroadcaster implements Broadcaster {
  abstract readonly name: string

  constructor(protected readonly io: Server) {}

  abstract handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void

  /**
   * Emit to a specific socket channel
   */
  protected emit(channel: string, eventName: string, data: unknown): void {
    try {
      this.io.to(channel).emit(eventName, data)
    } catch (error) {
      console.error(`[${this.name}] Socket emission failed:`, error)
    }
  }
}
