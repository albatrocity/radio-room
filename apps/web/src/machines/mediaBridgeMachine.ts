import { setup, assign, fromCallback } from "xstate"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { toast } from "../lib/toasts"

const STATUS_POLL_MS = 15_000

export interface MediaBridgeContext {
  subscriptionId: string | null
  lastError: string | null
  daemonId: string | null
  /** Daemon CAPABILITIES services when known; null until first status with services. */
  services: string[] | null
}

type MediaBridgeEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "LINK" }
  | { type: "POLL" }
  | {
      type: "MEDIA_BRIDGE_STATUS_CHANGED"
      data?: {
        connected?: boolean
        roomId?: string
        message?: string
        daemonId?: string
        services?: string[]
      }
    }
  | {
      type: "LINK_MEDIA_BRIDGE_SUCCESS"
      data?: { daemonId?: string; roomId?: string }
    }
  | {
      type: "LINK_MEDIA_BRIDGE_FAILURE"
      data?: { message?: string }
    }

let subscriptionCounter = 0

const defaultContext: MediaBridgeContext = {
  subscriptionId: null,
  lastError: null,
  daemonId: null,
  services: null,
}

const statusPollLogic = fromCallback<MediaBridgeEvent>(({ sendBack }) => {
  const id = setInterval(() => sendBack({ type: "POLL" }), STATUS_POLL_MS)
  return () => clearInterval(id)
})

export const mediaBridgeMachine = setup({
  types: {
    context: {} as MediaBridgeContext,
    events: {} as MediaBridgeEvent,
  },
  actors: {
    statusPoll: statusPollLogic,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `mediaBridge-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as MediaBridgeEvent),
        eventTypes: [
          "MEDIA_BRIDGE_STATUS_CHANGED",
          "LINK_MEDIA_BRIDGE_SUCCESS",
          "LINK_MEDIA_BRIDGE_FAILURE",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    fetchStatus: () => {
      emitToSocket("GET_MEDIA_BRIDGE_STATUS", {})
    },
    requestLink: () => {
      emitToSocket("LINK_MEDIA_BRIDGE", {})
    },
    clearError: assign({ lastError: null }),
    assignDaemonId: assign(({ event }) => {
      if (event.type !== "LINK_MEDIA_BRIDGE_SUCCESS") return {}
      return { daemonId: event.data?.daemonId ?? null, lastError: null }
    }),
    assignServicesFromStatus: assign(({ event }) => {
      if (event.type !== "MEDIA_BRIDGE_STATUS_CHANGED") return {}
      if (event.data?.services === undefined) return {}
      return { services: event.data.services }
    }),
    clearServices: assign({ services: null }),
    assignLinkFailure: assign(({ event }) => {
      if (event.type !== "LINK_MEDIA_BRIDGE_FAILURE") return {}
      return {
        lastError:
          event.data?.message ??
          "No Media Bridge is online. Start the bridge daemon on the DJ Mac, then try again.",
      }
    }),
    notifyLinkSuccess: () => {
      toast({
        title: "Media Bridge linked",
        description: "The DJ Mac bridge is connected to this room.",
        type: "success",
        duration: 4000,
      })
    },
    notifyLinkFailure: ({ context }) => {
      toast({
        title: "Couldn't link Media Bridge",
        description:
          context.lastError ??
          "No Media Bridge is online. Start the bridge daemon on the DJ Mac, then try again.",
        type: "error",
        duration: 8000,
      })
    },
    resetContext: assign(() => defaultContext),
  },
  guards: {
    isConnectedStatus: ({ event }) =>
      event.type === "MEDIA_BRIDGE_STATUS_CHANGED" && Boolean(event.data?.connected),
    isDisconnectedStatus: ({ event }) =>
      event.type === "MEDIA_BRIDGE_STATUS_CHANGED" && !event.data?.connected,
  },
}).createMachine({
  id: "mediaBridge",
  initial: "idle",
  context: defaultContext,
  states: {
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    active: {
      entry: ["subscribe", "fetchStatus"],
      exit: ["unsubscribe", "resetContext"],
      invoke: {
        id: "statusPoll",
        src: "statusPoll",
      },
      on: {
        DEACTIVATE: "idle",
        POLL: { actions: ["fetchStatus"] },
      },
      initial: "unknown",
      states: {
        unknown: {
          on: {
            MEDIA_BRIDGE_STATUS_CHANGED: [
              {
                target: "connected",
                guard: "isConnectedStatus",
                actions: ["assignServicesFromStatus"],
              },
              {
                target: "disconnected",
                guard: "isDisconnectedStatus",
                actions: ["clearServices"],
              },
            ],
            LINK: { target: "linking", actions: ["clearError", "requestLink"] },
          },
        },
        disconnected: {
          on: {
            MEDIA_BRIDGE_STATUS_CHANGED: [
              {
                target: "connected",
                guard: "isConnectedStatus",
                actions: ["assignServicesFromStatus"],
              },
            ],
            LINK: { target: "linking", actions: ["clearError", "requestLink"] },
          },
        },
        connected: {
          on: {
            MEDIA_BRIDGE_STATUS_CHANGED: [
              {
                target: "disconnected",
                guard: "isDisconnectedStatus",
                actions: ["clearServices"],
              },
              { actions: ["assignServicesFromStatus"] },
            ],
          },
        },
        linking: {
          on: {
            LINK_MEDIA_BRIDGE_SUCCESS: {
              target: "connected",
              actions: ["assignDaemonId", "notifyLinkSuccess"],
            },
            LINK_MEDIA_BRIDGE_FAILURE: {
              target: "disconnected",
              actions: ["assignLinkFailure", "notifyLinkFailure", "clearServices"],
            },
            MEDIA_BRIDGE_STATUS_CHANGED: [
              {
                target: "connected",
                guard: "isConnectedStatus",
                actions: ["assignServicesFromStatus"],
              },
              {
                target: "disconnected",
                guard: "isDisconnectedStatus",
                actions: ["clearServices"],
              },
            ],
          },
        },
      },
    },
  },
})
