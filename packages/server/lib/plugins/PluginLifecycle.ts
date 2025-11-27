import { PluginLifecycle, PluginLifecycleEvents } from "@repo/types"

/**
 * Implementation of plugin lifecycle event management
 * Allows plugins to register handlers for system events
 */
export class PluginLifecycleImpl implements PluginLifecycle {
  private handlers: Map<keyof PluginLifecycleEvents, Set<Function>> = new Map()

  on<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  }

  off<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void {
    const eventHandlers = this.handlers.get(event)
    if (eventHandlers) {
      eventHandlers.delete(handler)
    }
  }

  /**
   * Emit an event to all registered handlers
   * This is called by the PluginRegistry, not by plugins
   */
  async emit<K extends keyof PluginLifecycleEvents>(
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): Promise<void> {
    const eventHandlers = this.handlers.get(event)

    if (!eventHandlers || eventHandlers.size === 0) {
      console.log(`[PluginLifecycle] No handlers registered for event ${event}`)
      return
    }

    console.log(`[PluginLifecycle] Calling ${eventHandlers.size} handler(s) for event ${event}`)

    // Execute all handlers (don't wait for them to prevent blocking)
    const promises = Array.from(eventHandlers).map(async (handler) => {
      try {
        await handler(data)
      } catch (error) {
        console.error(`[PluginLifecycle] Error in handler for event ${event}:`, error)
      }
    })

    await Promise.allSettled(promises)
  }

  /**
   * Get all registered handlers for debugging
   */
  getHandlerCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    Array.from(this.handlers.entries()).forEach(([event, handlers]) => {
      counts[event] = handlers.size
    })
    return counts
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear()
  }
}
