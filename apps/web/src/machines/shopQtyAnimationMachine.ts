import { assign, setup } from "xstate"

export const QTY_ANIM_MS = 380

type Dir = "up" | "down"

export interface ShopQtyContext {
  displayedQty: number
  animationsEnabled: boolean
  hasSynced: boolean
  out?: number
  incoming?: number
  dir?: Dir
}

export type ShopQtyEvent =
  | { type: "SYNC_QTY"; qty: number }
  | { type: "SET_ANIMATIONS_ENABLED"; enabled: boolean }

export const shopQtyAnimationMachine = setup({
  types: {
    context: {} as ShopQtyContext,
    events: {} as ShopQtyEvent,
    input: {} as { initialQty: number; animationsEnabled: boolean },
  },
  guards: {
    isFirstSync: ({ context }) => !context.hasSynced,
    idleQtyUnchanged: ({ context, event }) =>
      event.type === "SYNC_QTY" && context.hasSynced && event.qty === context.displayedQty,
    idleInstantUpdate: ({ context, event }) =>
      event.type === "SYNC_QTY" &&
      context.hasSynced &&
      !context.animationsEnabled &&
      event.qty !== context.displayedQty,
    idleAnimatedTransition: ({ context, event }) =>
      event.type === "SYNC_QTY" &&
      context.hasSynced &&
      context.animationsEnabled &&
      event.qty !== context.displayedQty,
    animatingQtyMatchesIncoming: ({ context, event }) =>
      event.type === "SYNC_QTY" && event.qty === context.incoming,
    animatingNeedsRetarget: ({ context, event }) =>
      event.type === "SYNC_QTY" && event.qty !== context.incoming,
  },
  actions: {
    completeFirstSync: assign({
      hasSynced: true,
      displayedQty: ({ event }) => (event.type === "SYNC_QTY" ? event.qty : 0),
    }),
    updateDisplayedInstant: assign({
      displayedQty: ({ event }) => (event.type === "SYNC_QTY" ? event.qty : 0),
    }),
    startTransitionFromIdle: assign({
      out: ({ context }) => context.displayedQty,
      incoming: ({ event }) => (event.type === "SYNC_QTY" ? event.qty : 0),
      dir: ({ context, event }) => {
        if (event.type !== "SYNC_QTY") return "up" as Dir
        return event.qty < context.displayedQty ? ("down" as Dir) : ("up" as Dir)
      },
    }),
    startTransitionFromAnimating: assign({
      out: ({ context }) => context.incoming!,
      incoming: ({ event }) => (event.type === "SYNC_QTY" ? event.qty : 0),
      dir: ({ context, event }) => {
        if (event.type !== "SYNC_QTY") return "up" as Dir
        const pivot = context.incoming!
        return event.qty < pivot ? ("down" as Dir) : ("up" as Dir)
      },
    }),
    completeAnimation: assign({
      displayedQty: ({ context }) => context.incoming!,
      out: undefined,
      incoming: undefined,
      dir: undefined,
    }),
    setAnimationsEnabledFlag: assign({
      animationsEnabled: ({ event }) =>
        event.type === "SET_ANIMATIONS_ENABLED" ? event.enabled : false,
    }),
    snapAnimatingToIncoming: assign({
      displayedQty: ({ context }) => context.incoming!,
      out: undefined,
      incoming: undefined,
      dir: undefined,
    }),
  },
}).createMachine({
  id: "shopQtyAnimation",
  context: ({ input }) => ({
    displayedQty: input.initialQty,
    animationsEnabled: input.animationsEnabled,
    hasSynced: false,
  }),
  initial: "idle",
  states: {
    idle: {
      on: {
        SET_ANIMATIONS_ENABLED: {
          actions: "setAnimationsEnabledFlag",
        },
        SYNC_QTY: [
          {
            guard: "isFirstSync",
            actions: "completeFirstSync",
          },
          {
            guard: "idleQtyUnchanged",
          },
          {
            guard: "idleInstantUpdate",
            actions: "updateDisplayedInstant",
          },
          {
            guard: "idleAnimatedTransition",
            target: "animating",
            actions: "startTransitionFromIdle",
          },
        ],
      },
    },
    animating: {
      after: {
        [QTY_ANIM_MS]: {
          target: "idle",
          actions: "completeAnimation",
        },
      },
      on: {
        SET_ANIMATIONS_ENABLED: [
          {
            guard: ({ event }) => event.type === "SET_ANIMATIONS_ENABLED" && !event.enabled,
            target: "idle",
            actions: ["setAnimationsEnabledFlag", "snapAnimatingToIncoming"],
          },
          {
            actions: "setAnimationsEnabledFlag",
          },
        ],
        SYNC_QTY: [
          {
            guard: "animatingQtyMatchesIncoming",
          },
          {
            guard: "animatingNeedsRetarget",
            target: "animating",
            reenter: true,
            actions: "startTransitionFromAnimating",
          },
        ],
      },
    },
  },
})
