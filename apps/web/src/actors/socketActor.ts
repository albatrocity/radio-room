/**
 * Centralized Socket Actor
 *
 * This actor manages the socket.io connection lifecycle and broadcasts
 * events to all subscribed actors. It serves as the single source of truth
 * for socket state and the event distribution hub.
 *
 * Other actors subscribe to receive events rather than invoking socketService directly.
 */

import { createMachine, interpret, assign, AnyActorRef } from "xstate"
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
// Socket Connection Service
// ============================================================================

/**
 * Invoked service that listens to all socket events and forwards them
 * to the machine as internal events.
 */
function socketConnectionService(callback: (event: SocketMachineEvent) => void) {
  // Handle incoming events from server
  const handleServerEvent = (e: SocketEvent) => {
    callback({ type: "SERVER_EVENT", eventType: e.type, data: e.data })
  }

  // Socket-level lifecycle events
  const handleConnect = () => {
    console.log("[SocketActor] Connected")
    callback({ type: "SOCKET_CONNECTED" })
  }

  const handleDisconnect = (reason: string) => {
    console.log("[SocketActor] Disconnected:", reason)
    callback({ type: "SOCKET_DISCONNECTED", reason })
  }

  const handleError = (error: Error) => {
    console.error("[SocketActor] Error:", error)
    callback({ type: "SOCKET_ERROR", error: error.message })
  }

  // Manager-level reconnection events (Socket.io v4)
  const handleReconnectAttempt = (attemptNumber: number) => {
    console.log("[SocketActor] Reconnect attempt:", attemptNumber)
    callback({ type: "SOCKET_RECONNECTING", attemptNumber })
  }

  const handleReconnect = (attemptNumber: number) => {
    console.log("[SocketActor] Reconnected after", attemptNumber, "attempts")
    callback({ type: "SOCKET_RECONNECTED", attemptNumber })
  }

  const handleReconnectError = (error: Error) => {
    console.error("[SocketActor] Reconnect error:", error.message)
    callback({ type: "SOCKET_ERROR", error: error.message })
  }

  const handleReconnectFailed = () => {
    console.error("[SocketActor] Reconnection failed after all attempts")
    callback({ type: "SOCKET_RECONNECT_FAILED" })
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
    callback({ type: "SOCKET_CONNECTED" })
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
}

// ============================================================================
// Socket Machine
// ============================================================================

const socketMachine = createMachine<SocketContext, SocketMachineEvent>(
  {
    id: "socket",
    predictableActionArguments: true,
    initial: "initializing",
    context: {
      subscribers: {},
      connectionStatus: "disconnected",
      reconnectAttempts: 0,
      lastError: null,
    },
    invoke: {
      id: "socketConnection",
      src: () => socketConnectionService,
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
    },
    states: {
      initializing: {
        on: {
          SOCKET_CONNECTED: {
            target: "connected",
            actions: "setConnected",
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
          SERVER_EVENT: {
            actions: "broadcastToSubscribers",
          },
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
  },
  {
    actions: {
      addSubscriber: assign({
        subscribers: (ctx, event) => {
          if (event.type !== "SUBSCRIBE") return ctx.subscribers
          if (!event.subscriber || typeof event.subscriber.send !== "function") {
            console.error("[SocketActor] Invalid subscriber for ID:", event.id, event.subscriber)
            return ctx.subscribers
          }
          // Using object allows idempotent subscriptions - same ID just updates reference
          return { ...ctx.subscribers, [event.id]: event.subscriber }
        },
      }),
      removeSubscriber: assign({
        subscribers: (ctx, event) => {
          if (event.type !== "UNSUBSCRIBE") return ctx.subscribers
          const { [event.id]: removed, ...rest } = ctx.subscribers
          return rest
        },
      }),
      setConnected: assign({
        connectionStatus: () => "connected" as const,
        lastError: () => null,
      }),
      setDisconnected: assign({
        connectionStatus: () => "disconnected" as const,
      }),
      setReconnecting: assign({
        connectionStatus: () => "connecting" as const,
      }),
      setError: assign({
        lastError: (_ctx, event) => {
          if (event.type === "SOCKET_ERROR") {
            return event.error
          }
          return null
        },
      }),
      incrementReconnectAttempts: assign({
        reconnectAttempts: (ctx, event) => {
          if (event.type === "SOCKET_RECONNECTING") {
            return event.attemptNumber
          }
          return ctx.reconnectAttempts + 1
        },
      }),
      resetReconnectAttempts: assign({
        reconnectAttempts: () => 0,
      }),
      emitToServer: (_ctx, event) => {
        if (event.type !== "EMIT") return

        if (socket.connected) {
          socket.emit(event.eventType, event.data)
        } else {
          console.warn("[SocketActor] Cannot emit, socket disconnected:", event.eventType)
          // Try to reconnect if not already attempting
          if (!socket.active) {
            socket.connect()
          }
        }
      },
      broadcastToSubscribers: (ctx, event) => {
        if (event.type !== "SERVER_EVENT") return

        // Broadcast the event to all subscribers
        Object.entries(ctx.subscribers).forEach(([id, subscriber]) => {
          if (!subscriber || typeof subscriber.send !== "function") {
            console.warn("[SocketActor] Skipping invalid subscriber:", id)
            return
          }
          try {
            subscriber.send({ type: event.eventType, data: event.data })
          } catch (err) {
            console.error("[SocketActor] Error broadcasting to subscriber:", id, err)
          }
        })
      },
      broadcastReconnected: (ctx, event) => {
        if (event.type !== "SOCKET_RECONNECTED") return

        Object.entries(ctx.subscribers).forEach(([id, subscriber]) => {
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
      broadcastReconnectFailed: (ctx) => {
        Object.entries(ctx.subscribers).forEach(([id, subscriber]) => {
          if (!subscriber || typeof subscriber.send !== "function") return
          try {
            subscriber.send({ type: "SOCKET_RECONNECT_FAILED", data: {} })
          } catch (err) {
            console.error("[SocketActor] Error broadcasting reconnect failed:", id, err)
          }
        })
      },
    },
  },
)

// ============================================================================
// Singleton Actor Instance
// ============================================================================

export const socketActor = interpret(socketMachine).start()

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
  // Use actor.id which is available on all XState interpreters
  const id = (actor as any).sessionId || actor.id || String(Math.random())
  socketActor.send({
    type: "SUBSCRIBE",
    id,
    subscriber: { send: (event) => actor.send(event) },
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
  const id = (actor as any).sessionId || actor.id || ""
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
