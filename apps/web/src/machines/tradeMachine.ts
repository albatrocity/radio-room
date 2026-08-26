import { setup, assign } from "xstate"
import type { InventoryItem, ItemDefinition, TradeSession } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { getCurrentUser } from "../actors/authActor"

export type TradeMachineContext = {
  subscriptionId: string | null
  trade: TradeSession | null
  myInventory: InventoryItem[]
  definitions: ItemDefinition[]
  lastError: string | null
}

export type TradeMachineEvent =
  | { type: "ACTIVATE"; trade?: TradeSession | null }
  | { type: "DEACTIVATE" }
  | { type: "RESET" }
  | { type: "SET_TRADE"; trade: TradeSession | null }
  | { type: "TRADE_UPDATED"; data?: { trade?: TradeSession } }
  | { type: "TRADE_COMPLETED"; data?: { trade?: TradeSession } }
  | { type: "TRADE_CANCELLED"; data?: { trade?: TradeSession } }
  | { type: "TRADE_ACTION_RESULT"; data?: { success: boolean; message?: string; tradeId?: string } }
  | { type: "USER_GAME_STATE"; data?: { inventory?: { items: InventoryItem[] } | null; itemDefinitions?: ItemDefinition[]; activeTrade?: TradeSession | null } }

let subCounter = 0

export const tradeMachine = setup({
  types: {
    context: {} as TradeMachineContext,
    events: {} as TradeMachineEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `trade-${self.id}-${++subCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as TradeMachineEvent),
        eventTypes: [
          "TRADE_UPDATED",
          "TRADE_COMPLETED",
          "TRADE_CANCELLED",
          "TRADE_ACTION_RESULT",
          "USER_GAME_STATE",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) unsubscribeById(context.subscriptionId)
    },
    requestGameState: () => {
      emitToSocket("GET_MY_GAME_STATE", {})
    },
    assignFromActivate: assign(({ event }) => {
      if (event.type !== "ACTIVATE") return {}
      return { trade: event.trade ?? null, lastError: null }
    }),
    assignTradeEvent: assign(({ context, event }) => {
      if (
        event.type !== "TRADE_UPDATED" &&
        event.type !== "TRADE_COMPLETED" &&
        event.type !== "TRADE_CANCELLED"
      ) {
        return {}
      }
      const trade = event.data?.trade
      if (!trade) return {}
      const me = getCurrentUser()?.userId
      if (me && trade.participants[me] == null && event.type !== "TRADE_COMPLETED") {
        return {}
      }
      return { trade, lastError: null }
    }),
    assignFromGameState: assign(({ event }) => {
      if (event.type !== "USER_GAME_STATE") return {}
      return {
        myInventory: event.data?.inventory?.items ?? [],
        definitions: event.data?.itemDefinitions ?? [],
        trade: event.data?.activeTrade ?? null,
      }
    }),
    assignActionResult: assign(({ event }) => {
      if (event.type !== "TRADE_ACTION_RESULT" || !event.data) return {}
      if (event.data.success) return { lastError: null }
      return { lastError: event.data.message ?? "Trade action failed" }
    }),
    reset: assign({
      subscriptionId: () => null,
      trade: () => null,
      myInventory: () => [],
      definitions: () => [],
      lastError: () => null,
    }),
  },
}).createMachine({
  id: "trade",
  initial: "idle",
  context: {
    subscriptionId: null,
    trade: null,
    myInventory: [],
    definitions: [],
    lastError: null,
  },
  states: {
    idle: {
      on: {
        ACTIVATE: { target: "active", actions: ["assignFromActivate"] },
      },
    },
    active: {
      entry: ["subscribe", "requestGameState"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: { target: "idle", actions: ["reset"] },
        RESET: { actions: ["reset"] },
        TRADE_UPDATED: { actions: ["assignTradeEvent"] },
        TRADE_COMPLETED: { actions: ["assignTradeEvent"] },
        TRADE_CANCELLED: { actions: ["assignTradeEvent"] },
        TRADE_ACTION_RESULT: { actions: ["assignActionResult"] },
        USER_GAME_STATE: { actions: ["assignFromGameState"] },
        SET_TRADE: {
          actions: assign(({ event }) =>
            event.type === "SET_TRADE" ? { trade: event.trade } : {},
          ),
        },
      },
    },
  },
})
