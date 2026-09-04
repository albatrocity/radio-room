/**
 * User Game State Machine
 *
 * Manages the current user's game state (session, attributes, inventory).
 * Subscribes to socket events and re-fetches on relevant changes.
 *
 * Send ACTIVATE on room entry, DEACTIVATE on room exit (see roomLifecycle).
 * Send REFRESH when the modal opens to ensure fresh data.
 * Handles socket `INIT` (post-LOGIN) by requesting game state again — the initial
 * `GET_MY_GAME_STATE` from ACTIVATE can run before LOGIN attaches `roomId`.
 *
 * Plugins that implement `contributeToUserGameState` trigger refetch via the
 * room-wide `USER_GAME_STATE_INVALIDATED` event (ADR 0097).
 */

import type { StoredArtifactPublic, TradeSession, UserGameStatePayload } from "@repo/types"
import { resolveEconomy } from "@repo/game-logic"
import { setup, assign, enqueueActions } from "xstate"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { getCurrentUser } from "../actors/authActor"
import {
  isGameEventForUser,
  isGiftTradeEventForUser,
  tradeEscrowChanged,
  tradeHasUnknownDefinitions,
  type GiftTradeEventData,
  type UserScopedEventData,
} from "../lib/gameEventRelevance"
import {
  notifyGameStateNavSession,
  sessionSnapshotFromPayload,
} from "../lib/gameStateNavSession"
import { notifyGameStateNavInventory } from "../lib/gameStateNavInventory"
import { createTrailingDebounce } from "../lib/trailingDebounce"

export type { UserGameStatePayload }

interface UserGameStateContext {
  subscriptionId: string | null
  payload: UserGameStatePayload | null
  storedArtifacts: StoredArtifactPublic[]
  storedArtifactsSessionId: string | null
  error: string | null
}

type UserGameStateEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "REFRESH" }
  /** After LOGIN the socket has `roomId`; re-fetch so GET_MY_GAME_STATE is not lost to the pre-login timing race. */
  | { type: "INIT"; data?: unknown }
  | { type: "USER_GAME_STATE"; data: UserGameStatePayload }
  | { type: "USER_GAME_STATE_INVALIDATED"; data?: { roomId?: string; pluginName?: string } }
  | { type: "GAME_STATE_CHANGED"; data: UserScopedEventData }
  | { type: "GAME_MODIFIER_APPLIED"; data: UserScopedEventData }
  | { type: "GAME_MODIFIER_REMOVED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_ACQUIRED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_REMOVED"; data: UserScopedEventData & { itemId?: string } }
  | { type: "INVENTORY_ITEM_UPDATED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_USED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_TRANSFERRED"; data: UserScopedEventData & { item?: { itemId?: string } } }
  | { type: "GIFT_OFFERED"; data?: GiftTradeEventData }
  | { type: "GIFT_DECLINED"; data?: GiftTradeEventData }
  | { type: "GIFT_CANCELLED"; data?: GiftTradeEventData }
  | { type: "GIFT_COMPLETED"; data?: GiftTradeEventData }
  | { type: "TRADE_INVITE_OFFERED"; data?: GiftTradeEventData }
  | { type: "TRADE_INVITE_DECLINED"; data?: GiftTradeEventData }
  | { type: "TRADE_INVITE_CANCELLED"; data?: GiftTradeEventData }
  | { type: "TRADE_INVITE_EXPIRED"; data?: GiftTradeEventData }
  | { type: "TRADE_INVITE_ACCEPTED"; data?: GiftTradeEventData }
  | { type: "TRADE_UPDATED"; data?: GiftTradeEventData & { trade?: TradeSession } }
  | { type: "TRADE_COMPLETED"; data?: GiftTradeEventData }
  | { type: "TRADE_CANCELLED"; data?: GiftTradeEventData }
  | { type: "GAME_SESSION_STARTED"; data: unknown }
  | { type: "GAME_SESSION_CONFIG_UPDATED"; data: unknown }
  | {
      type: "GAME_ECONOMY_SCALE_CHANGED"
      data: { costScale: number; earnScale: number; updatedBy?: "admin" | "plugin"; reason?: string }
    }
  | { type: "GAME_SESSION_ENDED"; data: unknown }
  | {
      type: "PRESENTED_IDENTITY_CHANGED"
      data?: { userId?: string; grant?: unknown }
    }
  | { type: "ERROR_OCCURRED"; data: { message?: string } }
  | { type: "STORED_ARTIFACTS_RESULT"; data?: { artifacts?: StoredArtifactPublic[] } }

/** Trailing debounce so bursts of invalidation collapse into one refetch. */
const REQUEST_DEBOUNCE_MS = 150

const debouncedRequest = createTrailingDebounce(() => {
  emitToSocket("GET_MY_GAME_STATE", {})
}, REQUEST_DEBOUNCE_MS)

let subscriptionCounter = 0

const refetchMyGiftTrade = {
  guard: "isMyGiftTradeEvent" as const,
  actions: ["scheduleRequestGameState"] as const,
}

export const userGameStateMachine = setup({
  types: {
    context: {} as UserGameStateContext,
    events: {} as UserGameStateEvent,
  },
  guards: {
    /** Room-wide game/inventory events name their subject; skip everyone else's. */
    isMyGameEvent: ({ event }) => {
      const data = (event as { data?: UserScopedEventData }).data
      return isGameEventForUser(data, getCurrentUser()?.userId)
    },
    isMyGiftTradeEvent: ({ event }) => {
      const data = (event as { data?: GiftTradeEventData }).data
      return isGiftTradeEventForUser(data, getCurrentUser()?.userId)
    },
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `userGameState-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (event) => {
          if (self.getSnapshot().status !== "active") return
          self.send(event as UserGameStateEvent)
        },
        eventTypes: [
          "INIT",
          "USER_GAME_STATE",
          "USER_GAME_STATE_INVALIDATED",
          "ERROR_OCCURRED",
          "GAME_SESSION_STARTED",
          "GAME_SESSION_ENDED",
          "GAME_STATE_CHANGED",
          "GAME_MODIFIER_APPLIED",
          "GAME_MODIFIER_REMOVED",
          "PRESENTED_IDENTITY_CHANGED",
          "INVENTORY_ITEM_ACQUIRED",
          "INVENTORY_ITEM_REMOVED",
          "INVENTORY_ITEM_UPDATED",
          "INVENTORY_ITEM_USED",
          "INVENTORY_ITEM_TRANSFERRED",
          "GIFT_OFFERED",
          "GIFT_DECLINED",
          "GIFT_CANCELLED",
          "GIFT_COMPLETED",
          "TRADE_INVITE_OFFERED",
          "TRADE_INVITE_DECLINED",
          "TRADE_INVITE_CANCELLED",
          "TRADE_INVITE_EXPIRED",
          "TRADE_INVITE_ACCEPTED",
          "TRADE_UPDATED",
          "TRADE_COMPLETED",
          "TRADE_CANCELLED",
          "GAME_SESSION_CONFIG_UPDATED",
          "GAME_ECONOMY_SCALE_CHANGED",
          "STORED_ARTIFACTS_RESULT",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
      debouncedRequest.cancel()
    },
    /** Immediate request (ACTIVATE / REFRESH / INIT) — no debounce. */
    requestGameState: () => {
      debouncedRequest.cancel()
      emitToSocket("GET_MY_GAME_STATE", {})
    },
    /** Debounced request for socket-driven invalidation bursts. */
    scheduleRequestGameState: () => {
      debouncedRequest.schedule()
    },
    /** Named assign: `enqueue.assign()` during socket broadcast warns (custom-action stack). */
    patchActiveTrade: assign(({ context, event }) => {
      if (event.type !== "TRADE_UPDATED") return {}
      const trade = event.data?.trade
      if (!trade || !context.payload) return {}
      return {
        payload: {
          ...context.payload,
          activeTrade: trade,
        },
      }
    }),
    scheduleRefetchIfTradeEscrowChanged: ({ context, event }) => {
      if (event.type !== "TRADE_UPDATED") return
      const trade = event.data?.trade
      if (!trade || !context.payload) return
      if (
        tradeEscrowChanged(context.payload.activeTrade, trade) ||
        tradeHasUnknownDefinitions(trade, context.payload.itemDefinitions)
      ) {
        debouncedRequest.schedule()
      }
    },
    notifyNavSessionFromTrade: ({ context, event }) => {
      if (event.type !== "TRADE_UPDATED") return
      const trade = event.data?.trade
      if (!trade || !context.payload) return
      notifyGameStateNavSession({
        allowTrading: context.payload.session?.config?.allowTrading === true,
        activeTrade: trade,
      })
    },
    setPayload: assign(({ event }) => {
      if (event.type !== "USER_GAME_STATE") return {}
      const d = event.data
      return {
        payload: {
          session: d.session,
          state: d.state,
          inventory: d.inventory,
          itemDefinitions: d.itemDefinitions ?? [],
          pluginUserState: d.pluginUserState ?? {},
          pendingGifts: d.pendingGifts,
          pendingTradeInvites: d.pendingTradeInvites,
          activeTrade: d.activeTrade ?? null,
          presentedIdentity: d.presentedIdentity ?? null,
        },
        error: null,
      }
    }),
    mergeEconomyScale: assign(({ event, context }) => {
      if (event.type !== "GAME_ECONOMY_SCALE_CHANGED") return {}
      const payload = context.payload
      if (!payload?.session) return {}
      const prev = resolveEconomy(payload.session.config.economy)
      return {
        payload: {
          ...payload,
          session: {
            ...payload.session,
            config: {
              ...payload.session.config,
              economy: {
                ...prev,
                costScale: event.data.costScale,
                earnScale: event.data.earnScale,
                updatedBy: event.data.updatedBy,
                reason: event.data.reason,
              },
            },
          },
        },
      }
    }),
    notifyNavSession: ({ event, context }) => {
      if (event.type === "USER_GAME_STATE") {
        notifyGameStateNavSession(sessionSnapshotFromPayload(event.data))
        notifyGameStateNavInventory({
          type: "held",
          itemIds: (event.data.inventory?.items ?? []).map((item) => item.itemId),
        })
        return
      }
      notifyGameStateNavSession(sessionSnapshotFromPayload(context.payload))
    },
    notifyNavSessionCleared: () => {
      notifyGameStateNavSession(sessionSnapshotFromPayload(null))
      notifyGameStateNavInventory({ type: "held", itemIds: [] })
    },
    notifyNavDropRemovedItem: ({ event }) => {
      if (event.type !== "INVENTORY_ITEM_REMOVED") return
      const itemId = event.data.itemId?.trim()
      if (itemId) notifyGameStateNavInventory({ type: "drop", itemId })
    },
    notifyNavDropTransferredItem: ({ event }) => {
      if (event.type !== "INVENTORY_ITEM_TRANSFERRED") return
      const me = getCurrentUser()?.userId
      if (!me || event.data.fromUserId !== me) return
      const itemId = event.data.item?.itemId?.trim()
      if (itemId) notifyGameStateNavInventory({ type: "drop", itemId })
    },
    requestStoredArtifacts: enqueueActions(({ event, context, enqueue }) => {
      if (event.type !== "USER_GAME_STATE") return
      const sessionId = event.data.session?.id
      if (!sessionId) return
      if (context.storedArtifactsSessionId === sessionId) return
      enqueue("assignStoredArtifactsSessionId")
      enqueue(() => {
        emitToSocket("GET_STORED_ARTIFACTS", {})
      })
    }),
    assignStoredArtifactsSessionId: assign(({ event }) => {
      if (event.type !== "USER_GAME_STATE") return {}
      const sessionId = event.data.session?.id
      if (!sessionId) return {}
      return { storedArtifactsSessionId: sessionId }
    }),
    setStoredArtifacts: assign(({ event }) => {
      if (event.type !== "STORED_ARTIFACTS_RESULT") return {}
      return { storedArtifacts: event.data?.artifacts ?? [] }
    }),
    clearPayload: assign({
      payload: () => ({
        session: null,
        state: null,
        inventory: null,
        itemDefinitions: [],
        pluginUserState: {},
        pendingGifts: undefined,
        pendingTradeInvites: undefined,
        activeTrade: null,
        presentedIdentity: null,
      }),
      storedArtifacts: () => [],
      storedArtifactsSessionId: () => null,
      error: () => null,
    }),
    setError: assign(({ event }) => {
      if (event.type !== "ERROR_OCCURRED") return {}
      return { error: event.data?.message ?? "Could not load your game state." }
    }),
    reset: assign({
      subscriptionId: () => null,
      payload: () => null,
      storedArtifacts: () => [],
      storedArtifactsSessionId: () => null,
      error: () => null,
    }),
  },
}).createMachine({
  id: "userGameState",
  initial: "idle",
  context: {
    subscriptionId: null,
    payload: null,
    storedArtifacts: [],
    storedArtifactsSessionId: null,
    error: null,
  },
  /** Socket invalidations apply in every subscribed state (loading / ready / refreshing). */
  on: {
    USER_GAME_STATE_INVALIDATED: {
      actions: ["scheduleRequestGameState"],
    },
    GAME_STATE_CHANGED: {
      guard: "isMyGameEvent",
      actions: ["scheduleRequestGameState"],
    },
    GAME_MODIFIER_APPLIED: {
      guard: "isMyGameEvent",
      actions: ["scheduleRequestGameState"],
    },
    GAME_MODIFIER_REMOVED: {
      guard: "isMyGameEvent",
      actions: ["scheduleRequestGameState"],
    },
    PRESENTED_IDENTITY_CHANGED: {
      guard: "isMyGameEvent",
      actions: ["scheduleRequestGameState"],
    },
    INVENTORY_ITEM_ACQUIRED: {
      guard: "isMyGameEvent",
      actions: ["scheduleRequestGameState"],
    },
    INVENTORY_ITEM_REMOVED: {
      guard: "isMyGameEvent",
      actions: ["notifyNavDropRemovedItem", "scheduleRequestGameState"],
    },
    INVENTORY_ITEM_UPDATED: {
      guard: "isMyGameEvent",
      actions: ["scheduleRequestGameState"],
    },
    INVENTORY_ITEM_USED: {
      guard: "isMyGameEvent",
      actions: ["scheduleRequestGameState"],
    },
    INVENTORY_ITEM_TRANSFERRED: {
      guard: "isMyGameEvent",
      actions: ["notifyNavDropTransferredItem", "scheduleRequestGameState"],
    },
    GIFT_OFFERED: refetchMyGiftTrade,
    GIFT_DECLINED: refetchMyGiftTrade,
    GIFT_CANCELLED: refetchMyGiftTrade,
    GIFT_COMPLETED: refetchMyGiftTrade,
    TRADE_INVITE_OFFERED: refetchMyGiftTrade,
    TRADE_INVITE_DECLINED: refetchMyGiftTrade,
    TRADE_INVITE_CANCELLED: refetchMyGiftTrade,
    TRADE_INVITE_EXPIRED: refetchMyGiftTrade,
    TRADE_INVITE_ACCEPTED: refetchMyGiftTrade,
    TRADE_UPDATED: {
      guard: "isMyGiftTradeEvent",
      actions: [
        "scheduleRefetchIfTradeEscrowChanged",
        "patchActiveTrade",
        "notifyNavSessionFromTrade",
      ],
    },
    TRADE_COMPLETED: refetchMyGiftTrade,
    TRADE_CANCELLED: refetchMyGiftTrade,
    STORED_ARTIFACTS_RESULT: {
      actions: ["setStoredArtifacts"],
    },
  },
  states: {
    idle: {
      on: {
        ACTIVATE: "loading",
      },
    },
    loading: {
      entry: ["subscribe", "requestGameState"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset", "notifyNavSessionCleared"],
        },
        INIT: {
          actions: ["requestGameState"],
        },
        USER_GAME_STATE: {
          target: "ready",
          actions: ["setPayload", "notifyNavSession", "requestStoredArtifacts"],
        },
        ERROR_OCCURRED: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    ready: {
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset", "notifyNavSessionCleared"],
        },
        REFRESH: {
          target: "refreshing",
        },
        INIT: {
          actions: ["requestGameState"],
        },
        USER_GAME_STATE: {
          actions: ["setPayload", "notifyNavSession", "requestStoredArtifacts"],
        },
        GAME_SESSION_STARTED: {
          actions: ["requestGameState"],
        },
        GAME_SESSION_CONFIG_UPDATED: {
          actions: ["requestGameState"],
        },
        GAME_ECONOMY_SCALE_CHANGED: {
          actions: ["mergeEconomyScale"],
        },
        GAME_SESSION_ENDED: {
          actions: ["clearPayload", "notifyNavSessionCleared"],
        },
      },
    },
    refreshing: {
      entry: ["requestGameState"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset", "notifyNavSessionCleared"],
        },
        INIT: {
          actions: ["requestGameState"],
        },
        USER_GAME_STATE: {
          target: "ready",
          actions: ["setPayload", "notifyNavSession", "requestStoredArtifacts"],
        },
        ERROR_OCCURRED: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    error: {
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset", "notifyNavSessionCleared"],
        },
        INIT: {
          target: "refreshing",
        },
        REFRESH: {
          target: "loading",
        },
      },
    },
  },
})
