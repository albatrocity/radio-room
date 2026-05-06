import type { PluginLifecycle, PluginLifecycleEvents } from "@repo/types"

/**
 * Same behavior as server `PluginLifecycleImpl`, without noisy logging.
 */
export class MockPluginLifecycle implements PluginLifecycle {
  private handlers: Map<keyof PluginLifecycleEvents, Set<Function>> = new Map()

  on<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  }

  off<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void {
    this.handlers.get(event)?.delete(handler)
  }

  async emit<K extends keyof PluginLifecycleEvents>(
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): Promise<void> {
    const eventHandlers = this.handlers.get(event)
    if (!eventHandlers?.size) return
    await Promise.allSettled(
      Array.from(eventHandlers).map(async (handler) => {
        try {
          await (handler as (d: typeof data) => Promise<void> | void)(data)
        } catch (error) {
          console.error(`[MockPluginLifecycle] Error in handler for ${String(event)}:`, error)
        }
      }),
    )
  }

  clear(): void {
    this.handlers.clear()
  }
}
