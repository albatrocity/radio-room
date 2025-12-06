import { setup, assign, fromCallback, fromPromise } from "xstate"
import type { PluginComponentState } from "../types/PluginComponent"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import { getPluginComponentState } from "../lib/serverApi"

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
  | { type: "xstate.done.actor.fetchComponentState"; output: PluginComponentState }
  | { type: "xstate.error.actor.fetchComponentState"; error: Error }
  | { type: string; data?: any } // For plugin-specific events

// ============================================================================
// Actors
// ============================================================================

/**
 * Socket subscription actor that filters events for a specific plugin.
 * Only forwards PLUGIN:{pluginName}:* events to the machine.
 *
 * Design Note: This actor intentionally ONLY listens to plugin events, not system events.
 * This keeps the machine simple and gives plugins full control over data transformation.
 *
 * Event Flow:
 *   System Event → Plugin Handler → Plugin transforms data → Plugin emits → Machine receives
 *
 * Example:
 *   TRACK_CHANGED → onTrackChanged() → extract playedAt → emit("TRACK_STARTED", {trackStartTime})
 *   → Machine receives PLUGIN:playlist-democracy:TRACK_STARTED
 */
const pluginSocketActor = fromCallback<PluginComponentEvent, { pluginName: string; storeKeys: string[] }>(
  ({ sendBack, input }) => {
    const { pluginName, storeKeys } = input
    // Generate a unique subscription ID for this plugin instance
    const subscriptionId = `plugin:${pluginName}:${Date.now()}`

    // Create a subscriber that receives events from socketActor and filters them
    const subscriber = {
      send: (event: { type: string; data?: any }) => {
        // Forward all socket lifecycle events
        if (
          event.type === "SOCKET_CONNECTED" ||
          event.type === "SOCKET_DISCONNECTED" ||
          event.type === "SOCKET_ERROR" ||
          event.type === "SOCKET_RECONNECTING" ||
          event.type === "SOCKET_RECONNECTED" ||
          event.type === "SOCKET_RECONNECT_FAILED"
        ) {
          sendBack({ type: event.type, data: event.data || {} })
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
        sendBack({
          type: "PLUGIN_EVENT",
          data: event.data as Record<string, unknown>,
        })
      },
    }

    // Subscribe to socket actor using ID-based subscription
    subscribeById(subscriptionId, subscriber)

    // Return cleanup function
    return () => {
      unsubscribeById(subscriptionId)
    }
  },
)

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
 * for fetchComponentState via .provide().
 */
interface PluginComponentInput {
  pluginName: string
  storeKeys: string[]
}

export const pluginComponentMachine = setup({
  types: {
    context: {} as PluginComponentContext,
    events: {} as PluginComponentEvent,
    input: {} as PluginComponentInput,
  },
  guards: {
    hasRoomId: ({ context }) => context.roomId !== null,
  },
  actors: {
    fetchComponentState: fromPromise(
      async ({ input }: { input: { roomId: string; pluginName: string } }) => {
        const response = await getPluginComponentState(input.roomId, input.pluginName)
        return response.state
      },
    ),
    pluginSocket: pluginSocketActor,
  },
  actions: {
    setRoomId: assign({
      roomId: ({ event }) => {
        if (event.type === "SET_ROOM_ID") {
          return event.roomId
        }
        return null
      },
    }),
    setStore: assign({
      store: ({ event }) => {
        if (event.type === "xstate.done.actor.fetchComponentState") {
          return event.output
        }
        return {}
      },
      error: null,
    }),
    setError: assign({
      error: ({ event }) => {
        if (event.type === "xstate.error.actor.fetchComponentState") {
          return event.error instanceof Error
            ? event.error
            : new Error("Failed to fetch plugin component state")
        }
        return null
      },
    }),
    updateStoreFromPluginEvent: assign({
      store: ({ context, event }) => {
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
    updateStore: assign({
      store: ({ context, event }) => {
        if (event.type === "UPDATE_STORE") {
          return { ...context.store, ...event.updates }
        }
        return context.store
      },
    }),
    resetContext: assign({
      roomId: null,
      store: {},
      error: null,
    }),
  },
}).createMachine({
  id: "pluginComponent",
  initial: "idle",
  context: ({ input }) => ({
    pluginName: input.pluginName,
    roomId: null,
    storeKeys: input.storeKeys,
    store: {},
    error: null,
  }),
  states: {
    idle: {
      // Automatically transition to fetching when roomId becomes available
      always: {
        target: "fetching",
        guard: "hasRoomId",
      },
      on: {
        SET_ROOM_ID: {
          actions: "setRoomId",
        },
      },
    },
    fetching: {
      invoke: {
        id: "fetchComponentState",
        src: "fetchComponentState",
        input: ({ context }) => ({
          roomId: context.roomId!,
          pluginName: context.pluginName,
        }),
        onDone: {
          target: "ready",
          actions: "setStore",
        },
        onError: {
          target: "error",
          actions: "setError",
        },
      },
    },
    ready: {
      // Invoke socket actor to listen for plugin events
      invoke: {
        id: "pluginSocket",
        src: "pluginSocket",
        input: ({ context }) => ({
          pluginName: context.pluginName,
          storeKeys: context.storeKeys,
        }),
      },
      on: {
        PLUGIN_EVENT: {
          actions: "updateStoreFromPluginEvent",
        },
        UPDATE_STORE: {
          actions: "updateStore",
        },
        SET_ROOM_ID: {
          // If roomId changes, refetch
          target: "fetching",
          actions: "setRoomId",
        },
        RESET: {
          target: "idle",
          actions: "resetContext",
        },
      },
    },
    error: {
      on: {
        RETRY: "fetching",
        RESET: {
          target: "idle",
          actions: "resetContext",
        },
      },
    },
  },
})

// ============================================================================
// Type Exports
// ============================================================================

export type PluginComponentMachine = typeof pluginComponentMachine
