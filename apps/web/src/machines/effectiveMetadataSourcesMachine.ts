import { setup, assign } from "xstate"
import type { MetadataBrowseCapabilities, MyMediaShelf } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

export interface EffectiveMetadataSourcesContext {
  subscriptionId: string | null
  /** Per-user effective search sources; null until first server payload. */
  metadataSourceIds: string[] | null
  browseableSourceIds: string[] | null
  browseSourceCapabilities: Record<string, MetadataBrowseCapabilities>
  myMedia: MyMediaShelf[]
}

type EffectiveMetadataSourcesEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "REFRESH" }
  | {
      type: "EFFECTIVE_METADATA_SOURCES"
      data?: {
        metadataSourceIds?: string[]
        browseableSourceIds?: string[]
        browseSourceCapabilities?: Record<string, MetadataBrowseCapabilities>
        myMedia?: MyMediaShelf[]
      }
    }
  | {
      type: "INIT"
      data?: {
        effectiveMetadataSourceIds?: string[]
        browseableSourceIds?: string[]
        browseSourceCapabilities?: Record<string, MetadataBrowseCapabilities>
        myMedia?: MyMediaShelf[]
      }
    }
  | { type: "ROOM_SETTINGS_UPDATED"; data?: unknown }
  | { type: "MEDIA_BRIDGE_STATUS_CHANGED"; data?: unknown }
  | { type: "INVENTORY_ITEM_ACQUIRED"; data?: unknown }
  | { type: "INVENTORY_ITEM_REMOVED"; data?: unknown }
  | { type: "INVENTORY_ITEM_USED"; data?: unknown }
  | { type: "INVENTORY_ITEM_TRANSFERRED"; data?: unknown }

let subscriptionCounter = 0

const defaultContext: EffectiveMetadataSourcesContext = {
  subscriptionId: null,
  metadataSourceIds: null,
  browseableSourceIds: null,
  browseSourceCapabilities: {},
  myMedia: [],
}

export const effectiveMetadataSourcesMachine = setup({
  types: {
    context: {} as EffectiveMetadataSourcesContext,
    events: {} as EffectiveMetadataSourcesEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `effectiveMetadataSources-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as EffectiveMetadataSourcesEvent),
        eventTypes: [
          "INIT",
          "EFFECTIVE_METADATA_SOURCES",
          "ROOM_SETTINGS_UPDATED",
          "MEDIA_BRIDGE_STATUS_CHANGED",
          "INVENTORY_ITEM_ACQUIRED",
          "INVENTORY_ITEM_REMOVED",
          "INVENTORY_ITEM_USED",
          "INVENTORY_ITEM_TRANSFERRED",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    fetchEffective: () => {
      emitToSocket("GET_EFFECTIVE_METADATA_SOURCES", {})
    },
    assignFromEffectiveEvent: assign(({ event }) => {
      if (event.type !== "EFFECTIVE_METADATA_SOURCES") return {}
      return {
        ...(Array.isArray(event.data?.metadataSourceIds)
          ? { metadataSourceIds: event.data.metadataSourceIds }
          : {}),
        ...(Array.isArray(event.data?.browseableSourceIds)
          ? { browseableSourceIds: event.data.browseableSourceIds }
          : {}),
        ...(event.data?.browseSourceCapabilities
          ? { browseSourceCapabilities: event.data.browseSourceCapabilities }
          : {}),
        ...(Array.isArray(event.data?.myMedia) ? { myMedia: event.data.myMedia } : {}),
      }
    }),
    assignFromInit: assign(({ event }) => {
      if (event.type !== "INIT") return {}
      return {
        ...(Array.isArray(event.data?.effectiveMetadataSourceIds)
          ? { metadataSourceIds: event.data.effectiveMetadataSourceIds }
          : {}),
        ...(Array.isArray(event.data?.browseableSourceIds)
          ? { browseableSourceIds: event.data.browseableSourceIds }
          : {}),
        ...(event.data?.browseSourceCapabilities
          ? { browseSourceCapabilities: event.data.browseSourceCapabilities }
          : {}),
        ...(Array.isArray(event.data?.myMedia) ? { myMedia: event.data.myMedia } : {}),
      }
    }),
    resetContext: assign(() => defaultContext),
  },
}).createMachine({
  id: "effectiveMetadataSources",
  initial: "idle",
  context: defaultContext,
  states: {
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    active: {
      entry: ["subscribe", "fetchEffective"],
      exit: ["unsubscribe", "resetContext"],
      on: {
        DEACTIVATE: "idle",
        REFRESH: { actions: ["fetchEffective"] },
        EFFECTIVE_METADATA_SOURCES: { actions: ["assignFromEffectiveEvent"] },
        INIT: { actions: ["assignFromInit"] },
        ROOM_SETTINGS_UPDATED: { actions: ["fetchEffective"] },
        MEDIA_BRIDGE_STATUS_CHANGED: { actions: ["fetchEffective"] },
        INVENTORY_ITEM_ACQUIRED: { actions: ["fetchEffective"] },
        INVENTORY_ITEM_REMOVED: { actions: ["fetchEffective"] },
        INVENTORY_ITEM_USED: { actions: ["fetchEffective"] },
        INVENTORY_ITEM_TRANSFERRED: { actions: ["fetchEffective"] },
      },
    },
  },
})
