/**
 * Centralized Socket Actor
 *
 * This actor manages the socket.io connection lifecycle and broadcasts
 * events to all subscribed actors. It serves as the single source of truth
 * for socket state and the event distribution hub.
 *
 * Other actors subscribe to receive events rather than invoking socketService directly.
 *
 * XState v5: Uses fromCallback for socket subscriptions and setup() for type-safe machine definition.
 */

import { setup, fromCallback, assign, createActor, AnyActorRef, EventObject } from "xstate"
import socket from "../lib/socket"

// ============================================================================
// Types
// ============================================================================

export interface SocketEvent {
  type: string
  data: any
}

/**
 * Subscriber info stored by ID for resilient subscriptions.
 * Using ID-based subscriptions allows re-subscribing with the same ID
 * to just update the reference, making it resilient to React StrictMode.
 */
interface Subscriber {
  send: (event: { type: string; data?: any }) => void
}

interface SocketContext {
  // Record<subscriberId, subscriber> - ID-based for resilient subscriptions
  // Using plain object instead of Map for better XState compatibility
  subscribers: Record<string, Subscriber>
  connectionStatus: "disconnected" | "connecting" | "connected"
  reconnectAttempts: number
  lastError: string | null
}

type SocketMachineEvent =
  | { type: "SUBSCRIBE"; id: string; subscriber: Subscriber }
  | { type: "UNSUBSCRIBE"; id: string }
  | { type: "EMIT"; eventType: string; data: any }
  | { type: "SERVER_EVENT"; eventType: string; data: any }
  | { type: "SOCKET_CONNECTED" }
  | { type: "SOCKET_DISCONNECTED"; reason?: string }
  | { type: "SOCKET_ERROR"; error: string }
  | { type: "SOCKET_RECONNECTING"; attemptNumber: number }
  | { type: "SOCKET_RECONNECTED"; attemptNumber: number }
  | { type: "SOCKET_RECONNECT_FAILED" }

// ============================================================================
// Socket Connection Actor (fromCallback)
// ============================================================================

/**
 * XState v5 callback actor that listens to all socket events and forwards them
 * to the parent machine as events.
 */
const socketConnectionLogic = fromCallback<SocketMachineEvent>(({ sendBack }) => {
  // Handle incoming events from server
  const handleServerEvent = (e: SocketEvent) => {
    sendBack({ type: "SERVER_EVENT", eventType: e.type, data: e.data })
  }

  // Socket-level lifecycle events
  const handleConnect = () => {
    sendBack({ type: "SOCKET_CONNECTED" })
  }

  const handleDisconnect = (reason: string) => {
    console.log("[SocketActor] Disconnected:", reason)
    sendBack({ type: "SOCKET_DISCONNECTED", reason })
  }

  const handleError = (error: Error) => {
    console.error("[SocketActor] Error:", error)
    sendBack({ type: "SOCKET_ERROR", error: error.message })
  }

  // Manager-level reconnection events (Socket.io v4)
  const handleReconnectAttempt = (attemptNumber: number) => {
    console.log("[SocketActor] Reconnect attempt:", attemptNumber)
    sendBack({ type: "SOCKET_RECONNECTING", attemptNumber })
  }

  const handleReconnect = (attemptNumber: number) => {
    console.log("[SocketActor] Reconnected after", attemptNumber, "attempts")
    sendBack({ type: "SOCKET_RECONNECTED", attemptNumber })
  }

  const handleReconnectError = (error: Error) => {
    console.error("[SocketActor] Reconnect error:", error.message)
    sendBack({ type: "SOCKET_ERROR", error: error.message })
  }

  const handleReconnectFailed = () => {
    console.error("[SocketActor] Reconnection failed after all attempts")
    sendBack({ type: "SOCKET_RECONNECT_FAILED" })
  }

  // Register listeners
  socket.on("event", handleServerEvent)
  socket.on("connect", handleConnect)
  socket.on("disconnect", handleDisconnect)
  socket.on("error", handleError)
  socket.io.on("reconnect_attempt", handleReconnectAttempt)
  socket.io.on("reconnect", handleReconnect)
  socket.io.on("reconnect_error", handleReconnectError)
  socket.io.on("reconnect_failed", handleReconnectFailed)

  // If socket is already connected, notify immediately
  if (socket.connected) {
    sendBack({ type: "SOCKET_CONNECTED" })
  }

  // Cleanup function
  return () => {
    socket.off("event", handleServerEvent)
    socket.off("connect", handleConnect)
    socket.off("disconnect", handleDisconnect)
    socket.off("error", handleError)
    socket.io.off("reconnect_attempt", handleReconnectAttempt)
    socket.io.off("reconnect", handleReconnect)
    socket.io.off("reconnect_error", handleReconnectError)
    socket.io.off("reconnect_failed", handleReconnectFailed)
  }
})

// ============================================================================
// Socket Machine (XState v5 setup pattern)
// ============================================================================

const socketMachine = setup({
  types: {
    context: {} as SocketContext,
    events: {} as SocketMachineEvent,
  },
  actors: {
    socketConnection: socketConnectionLogic,
  },
  actions: {
    addSubscriber: assign(({ context, event }: { context: SocketContext; event: SocketMachineEvent }) => {
      if (event.type !== "SUBSCRIBE") return {}
      if (!event.subscriber || typeof event.subscriber.send !== "function") {
        console.error("[SocketActor] Invalid subscriber for ID:", event.id, event.subscriber)
        return {}
      }
      // Using object allows idempotent subscriptions - same ID just updates reference
      return { subscribers: { ...context.subscribers, [event.id]: event.subscriber } }
    }),
    removeSubscriber: assign(({ context, event }: { context: SocketContext; event: SocketMachineEvent }) => {
      if (event.type !== "UNSUBSCRIBE") return {}
      const { [event.id]: _removed, ...rest } = context.subscribers
      return { subscribers: rest }
    }),
    setConnected: assign({
      connectionStatus: "connected" as const,
      lastError: null,
    }),
    setDisconnected: assign({
      connectionStatus: "disconnected" as const,
    }),
    setReconnecting: assign({
      connectionStatus: "connecting" as const,
    }),
    setError: assign(({ event }: { event: SocketMachineEvent }) => {
      if (event.type === "SOCKET_ERROR") {
        return { lastError: event.error }
      }
      return { lastError: null }
    }),
    incrementReconnectAttempts: assign(({ context, event }: { context: SocketContext; event: SocketMachineEvent }) => {
      if (event.type === "SOCKET_RECONNECTING") {
        return { reconnectAttempts: event.attemptNumber }
      }
      return { reconnectAttempts: context.reconnectAttempts + 1 }
    }),
    resetReconnectAttempts: assign({
      reconnectAttempts: 0,
    }),
    emitToServer: ({ event }: { event: SocketMachineEvent }) => {
      if (event.type !== "EMIT") return

      if (socket.connected) {
        socket.emit(event.eventType, event.data)
      } else {
        // Socket not connected - it will retry on SOCKET_CONNECTED
        if (!socket.active) {
          socket.connect()
        }
      }
    },
    broadcastToSubscribers: ({ context, event }: { context: SocketContext; event: SocketMachineEvent }) => {
      if (event.type !== "SERVER_EVENT") return

      // Broadcast the event to all subscribers
      Object.entries(context.subscribers).forEach(([id, subscriber]) => {
        if (!subscriber || typeof subscriber.send !== "function") return
        try {
          subscriber.send({ type: event.eventType, data: event.data })
        } catch (err) {
          console.error("[SocketActor] Error broadcasting to subscriber:", id, err)
        }
      })
    },
    broadcastConnected: ({ context }: { context: SocketContext }) => {
      Object.entries(context.subscribers).forEach(([id, subscriber]) => {
        if (!subscriber || typeof subscriber.send !== "function") return
        try {
          subscriber.send({ type: "SOCKET_CONNECTED", data: {} })
        } catch (err) {
          console.error("[SocketActor] Error broadcasting connected:", id, err)
        }
      })
    },
    broadcastReconnected: ({ context, event }: { context: SocketContext; event: SocketMachineEvent }) => {
      if (event.type !== "SOCKET_RECONNECTED") return

      Object.entries(context.subscribers).forEach(([id, subscriber]) => {
        if (!subscriber || typeof subscriber.send !== "function") return
        try {
          subscriber.send({
            type: "SOCKET_RECONNECTED",
            data: { attemptNumber: event.attemptNumber },
          })
        } catch (err) {
          console.error("[SocketActor] Error broadcasting reconnected:", id, err)
        }
      })
    },
    broadcastReconnectFailed: ({ context }: { context: SocketContext }) => {
      Object.entries(context.subscribers).forEach(([id, subscriber]) => {
        if (!subscriber || typeof subscriber.send !== "function") return
        try {
          subscriber.send({ type: "SOCKET_RECONNECT_FAILED", data: {} })
        } catch (err) {
          console.error("[SocketActor] Error broadcasting reconnect failed:", id, err)
        }
      })
    },
  },
}).createMachine({
  id: "socket",
  initial: "initializing",
  context: {
    subscribers: {},
    connectionStatus: "disconnected",
    reconnectAttempts: 0,
    lastError: null,
  },
  invoke: {
    id: "socketConnection",
    src: "socketConnection",
  },
  on: {
    // Subscription management - available in all states
    SUBSCRIBE: {
      actions: "addSubscriber",
    },
    UNSUBSCRIBE: {
      actions: "removeSubscriber",
    },
    // Outgoing events - emit to server
    EMIT: {
      actions: "emitToServer",
    },
    // Handle server events in all states to avoid race conditions
    // (events can arrive before SOCKET_CONNECTED is processed)
    SERVER_EVENT: {
      actions: "broadcastToSubscribers",
    },
  },
  states: {
    initializing: {
      on: {
        SOCKET_CONNECTED: {
          target: "connected",
          actions: ["setConnected", "broadcastConnected"],
        },
        SOCKET_DISCONNECTED: {
          target: "disconnected",
          actions: "setDisconnected",
        },
      },
    },
    disconnected: {
      entry: "setDisconnected",
      on: {
        SOCKET_CONNECTED: {
          target: "connected",
          actions: "setConnected",
        },
        SOCKET_RECONNECTING: {
          target: "reconnecting",
          actions: "setReconnecting",
        },
      },
    },
    connecting: {
      on: {
        SOCKET_CONNECTED: {
          target: "connected",
          actions: "setConnected",
        },
        SOCKET_ERROR: {
          target: "disconnected",
          actions: "setError",
        },
        SOCKET_DISCONNECTED: {
          target: "disconnected",
          actions: "setDisconnected",
        },
      },
    },
    connected: {
      entry: "setConnected",
      on: {
        SOCKET_DISCONNECTED: {
          target: "disconnected",
          actions: "setDisconnected",
        },
        SOCKET_ERROR: {
          actions: "setError",
        },
      },
    },
    reconnecting: {
      entry: "setReconnecting",
      on: {
        SOCKET_RECONNECTING: {
          actions: "incrementReconnectAttempts",
        },
        SOCKET_RECONNECTED: {
          target: "connected",
          actions: ["setConnected", "resetReconnectAttempts", "broadcastReconnected"],
        },
        SOCKET_RECONNECT_FAILED: {
          target: "disconnected",
          actions: ["setDisconnected", "broadcastReconnectFailed"],
        },
        SOCKET_CONNECTED: {
          target: "connected",
          actions: ["setConnected", "resetReconnectAttempts"],
        },
        SOCKET_ERROR: {
          actions: "setError",
        },
      },
    },
  },
})

// ============================================================================
// Singleton Actor Instance
// ============================================================================

export const socketActor = createActor(socketMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Subscribe to receive socket events using a stable ID.
 * Re-subscribing with the same ID updates the reference (idempotent).
 * This makes subscriptions resilient to React StrictMode double-mounting.
 *
 * @param id - Stable identifier for this subscription (e.g., machine ID)
 * @param subscriber - Object with a send method to receive events
 */
export function subscribeById(
  id: string,
  subscriber: { send: (event: { type: string; data?: any }) => void },
): void {
  if (!id || !subscriber) {
    console.error("[SocketActor] subscribeById called with invalid args:", id, subscriber)
    return
  }
  socketActor.send({ type: "SUBSCRIBE", id, subscriber })
}

/**
 * Unsubscribe from socket events by ID.
 *
 * @param id - The subscription ID to remove
 */
export function unsubscribeById(id: string): void {
  if (!id) {
    console.error("[SocketActor] unsubscribeById called with undefined id")
    return
  }
  socketActor.send({ type: "UNSUBSCRIBE", id })
}

/**
 * Subscribe an actor to receive socket events.
 * Uses the actor's id as the subscription ID for resilience.
 *
 * @param actor - The XState actor/interpreter to subscribe
 */
export function subscribeActor(actor: AnyActorRef): void {
  if (!actor) {
    console.error("[SocketActor] subscribeActor called with undefined actor")
    return
  }
  // Use actor.id which is available on all XState actors
  const id = actor.sessionId || actor.id || String(Math.random())
  socketActor.send({
    type: "SUBSCRIBE",
    id,
    subscriber: { send: (event: EventObject) => actor.send(event) },
  })
}

/**
 * Unsubscribe an actor from socket events.
 *
 * @param actor - The XState actor/interpreter to unsubscribe
 */
export function unsubscribeActor(actor: AnyActorRef): void {
  if (!actor) {
    console.error("[SocketActor] unsubscribeActor called with undefined actor")
    return
  }
  const id = actor.sessionId || actor.id || ""
  socketActor.send({ type: "UNSUBSCRIBE", id })
}

/**
 * Emit an event to the server via the socket.
 */
export function emitToSocket(eventType: string, data: any): void {
  socketActor.send({ type: "EMIT", eventType, data })
}

/**
 * Get the current connection status.
 */
export function getConnectionStatus(): "disconnected" | "connecting" | "connected" {
  return socketActor.getSnapshot().context.connectionStatus
}

/**
 * Check if socket is currently connected.
 */
export function isConnected(): boolean {
  return socketActor.getSnapshot().matches("connected")
}
