import { createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
import type { PluginComponentState } from "../types/PluginComponent"

// ============================================================================
// Context & Events
// ============================================================================

export interface PluginComponentContext {
  pluginName: string
  roomId: string | null
  storeKeys: string[]
  store: PluginComponentState
  error: Error | null
}

export type PluginComponentEvent =
  | { type: "SET_ROOM_ID"; roomId: string }
  | { type: "UPDATE_STORE"; updates: Record<string, unknown> }
  | { type: "PLUGIN_EVENT"; data: Record<string, unknown> }
  | { type: "RETRY" }
  | { type: "RESET" }
  | { type: "SOCKET_CONNECTED"; data: Record<string, unknown> }
  | { type: "SOCKET_DISCONNECTED"; data: Record<string, unknown> }
  | { type: "SOCKET_ERROR"; data: Record<string, unknown> }
  | { type: "SOCKET_RECONNECTING"; data: Record<string, unknown> }
  | { type: "SOCKET_RECONNECTED"; data: Record<string, unknown> }
  | { type: "SOCKET_RECONNECT_FAILED"; data: Record<string, unknown> }

// ============================================================================
// Services
// ============================================================================

/**
 * Creates a socket service that filters events for a specific plugin.
 * Only forwards PLUGIN:{pluginName}:* events to the machine.
 *
 * Design Note: This service intentionally ONLY listens to plugin events, not system events.
 * This keeps the machine simple and gives plugins full control over data transformation.
 *
 * Event Flow:
 *   System Event → Plugin Handler → Plugin transforms data → Plugin emits → Machine receives
 *
 * Example:
 *   TRACK_CHANGED → onTrackChanged() → extract playedAt → emit("TRACK_STARTED", {trackStartTime})
 *   → Machine receives PLUGIN:playlist-democracy:TRACK_STARTED
 */
function createPluginSocketService(pluginName: string, storeKeys: string[]) {
  return (callback: (event: PluginComponentEvent) => void) => {
    socketService(
      (event) => {
        // Forward all socket lifecycle events
        if (
          event.type === "SOCKET_CONNECTED" ||
          event.type === "SOCKET_DISCONNECTED" ||
          event.type === "SOCKET_ERROR" ||
          event.type === "SOCKET_RECONNECTING" ||
          event.type === "SOCKET_RECONNECTED" ||
          event.type === "SOCKET_RECONNECT_FAILED"
        ) {
          callback({ type: event.type, data: event.data || {} })
          return
        }

        // Filter plugin events
        const regex = /^PLUGIN:([^:]+):/
        const match = regex.exec(event.type || "")
        if (!match) return

        const eventPluginName = match[1]
        if (eventPluginName !== pluginName) return

        // Check if event data contains any store keys
        if (!event.data || typeof event.data !== "object") return

        const hasRelevantData = storeKeys.some((key) => key in event.data)
        if (!hasRelevantData) return

        // Forward as PLUGIN_EVENT
        callback({
          type: "PLUGIN_EVENT",
          data: event.data as Record<string, unknown>,
        })
      },
      () => {
        // No outgoing events needed for plugin components
      },
    )
  }
}

// ============================================================================
// Machine Definition
// ============================================================================

/**
 * State machine for managing a single plugin's component state.
 *
 * States:
 * - idle: Initial state, waiting for roomId
 * - fetching: Loading initial state from server
 * - ready: Successfully loaded, ready to receive updates via socket
 * - error: Failed to load, can retry
 *
 * The machine automatically:
 * - Fetches initial state when roomId becomes available
 * - Subscribes to PLUGIN:{pluginName}:* events (NOT system events)
 * - Updates store when matching plugin events arrive
 *
 * Architecture: Plugins are responsible for transforming system events into plugin events.
 * This keeps the machine simple and gives plugins full control over data transformation.
 *
 * This machine should be instantiated with a services implementation
 * for fetchComponentState via withConfig().
 */
export const pluginComponentMachine = createMachine<PluginComponentContext, PluginComponentEvent>({
  id: "pluginComponent",
  initial: "idle",
  context: {
    pluginName: "",
    roomId: null,
    storeKeys: [],
    store: {},
    error: null,
  },
  states: {
    idle: {
      // Automatically transition to fetching when roomId becomes available
      always: {
        target: "fetching",
        cond: (context) => context.roomId !== null,
      },
      on: {
        SET_ROOM_ID: {
          actions: assign({
            roomId: (_, event) => event.roomId,
          }),
        },
      },
    },
    fetching: {
      invoke: {
        id: "fetchComponentState",
        src: "fetchComponentState",
        onDone: {
          target: "ready",
          actions: assign({
            store: (_, event) => event.data as PluginComponentState,
            error: null,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: (_, event) =>
              event.data instanceof Error
                ? event.data
                : new Error("Failed to fetch plugin component state"),
          }),
        },
      },
    },
    ready: {
      // Invoke socket service to listen for plugin events
      invoke: {
        id: "pluginSocket",
        src: (context) => createPluginSocketService(context.pluginName, context.storeKeys),
      },
      on: {
        PLUGIN_EVENT: {
          actions: assign({
            store: (context, event) => {
              if (event.type !== "PLUGIN_EVENT") return context.store

              // Event data already contains the relevant updates (filtered by service)
              const updates: Record<string, unknown> = {}
              for (const key of context.storeKeys) {
                if (key in event.data) {
                  updates[key] = event.data[key]
                }
              }

              // Only update if there are matching keys
              if (Object.keys(updates).length === 0) return context.store

              return {
                ...context.store,
                ...updates,
              }
            },
          }),
        },
        UPDATE_STORE: {
          actions: assign({
            store: (context, event) =>
              event.type === "UPDATE_STORE"
                ? { ...context.store, ...event.updates }
                : context.store,
          }),
        },
        SET_ROOM_ID: {
          // If roomId changes, refetch
          target: "fetching",
          actions: assign({
            roomId: (_, event) => event.roomId,
          }),
        },
        RESET: {
          target: "idle",
          actions: assign({
            roomId: null,
            store: {},
            error: null,
          }),
        },
      },
    },
    error: {
      on: {
        RETRY: "fetching",
        RESET: {
          target: "idle",
          actions: assign({
            roomId: null,
            store: {},
            error: null,
          }),
        },
      },
    },
  },
})

// ============================================================================
// Type Exports
// ============================================================================

export type PluginComponentMachine = typeof pluginComponentMachine
