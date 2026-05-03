import { assign, setup } from "xstate"

export type CoinGainFeedbackEvent =
  | {
      type: "SYNC"
      coin: number
      coinAttributeEnabled: boolean
      sessionActive: boolean
      animationsEnabled: boolean
    }
  | { type: "ANIMATION_FINISHED" }

export type CoinFeedbackAnimationKind = "gain" | "loss"

export interface CoinGainFeedbackContext {
  previousCoin: number | undefined
  /** Latest coin value while `animating` (merges rapid SYNC updates). */
  pendingCoin: number | undefined
  /** Which timeline runs while in `animating`. */
  animationKind: CoinFeedbackAnimationKind | undefined
  /** Signed delta for the current animation (+ gain, − loss); set when entering `animating`. */
  animationCoinDelta: number | undefined
}

export const coinGainFeedbackMachine = setup({
  types: {
    context: {} as CoinGainFeedbackContext,
    events: {} as CoinGainFeedbackEvent,
  },
  actions: {
    clearTracking: assign({
      previousCoin: () => undefined,
      pendingCoin: () => undefined,
      animationKind: () => undefined,
      animationCoinDelta: () => undefined,
    }),
    setBaselineFromSync: assign({
      previousCoin: ({ event }) => (event.type === "SYNC" ? event.coin : undefined),
      pendingCoin: () => undefined,
      animationKind: () => undefined,
      animationCoinDelta: () => undefined,
    }),
    setPreviousFromSync: assign({
      previousCoin: ({ event }) => (event.type === "SYNC" ? event.coin : undefined),
    }),
    enterAnimatingGain: assign({
      pendingCoin: ({ event }) => (event.type === "SYNC" ? event.coin : undefined),
      animationKind: () => "gain" as const,
      animationCoinDelta: ({ context, event }) =>
        event.type === "SYNC" && context.previousCoin !== undefined
          ? event.coin - context.previousCoin
          : undefined,
    }),
    enterAnimatingLoss: assign({
      pendingCoin: ({ event }) => (event.type === "SYNC" ? event.coin : undefined),
      animationKind: () => "loss" as const,
      animationCoinDelta: ({ context, event }) =>
        event.type === "SYNC" && context.previousCoin !== undefined
          ? event.coin - context.previousCoin
          : undefined,
    }),
    mergePendingWhileAnimating: assign({
      pendingCoin: ({ event }) => (event.type === "SYNC" ? event.coin : undefined),
    }),
    finishAnimation: assign({
      previousCoin: ({ context }) => context.pendingCoin ?? context.previousCoin,
      pendingCoin: () => undefined,
      animationKind: () => undefined,
      animationCoinDelta: () => undefined,
    }),
  },
  guards: {
    lostTracking: ({ event }) =>
      event.type === "SYNC" && (!event.sessionActive || !event.coinAttributeEnabled),

    sessionWantsCoinTracking: ({ event }) =>
      event.type === "SYNC" && event.sessionActive && event.coinAttributeEnabled,

    shouldAnimateCoinGain: ({ context, event }) =>
      event.type === "SYNC" &&
      event.sessionActive &&
      event.coinAttributeEnabled &&
      event.animationsEnabled &&
      context.previousCoin !== undefined &&
      event.coin > context.previousCoin,

    coinIncreasedWithoutAnimation: ({ context, event }) =>
      event.type === "SYNC" &&
      event.sessionActive &&
      event.coinAttributeEnabled &&
      !event.animationsEnabled &&
      context.previousCoin !== undefined &&
      event.coin > context.previousCoin,

    shouldAnimateCoinLoss: ({ context, event }) =>
      event.type === "SYNC" &&
      event.sessionActive &&
      event.coinAttributeEnabled &&
      event.animationsEnabled &&
      context.previousCoin !== undefined &&
      event.coin < context.previousCoin,

    coinDecreasedWithoutAnimation: ({ context, event }) =>
      event.type === "SYNC" &&
      event.sessionActive &&
      event.coinAttributeEnabled &&
      !event.animationsEnabled &&
      context.previousCoin !== undefined &&
      event.coin < context.previousCoin,
  },
}).createMachine({
  id: "coinGainFeedback",
  initial: "inactive",
  context: {
    previousCoin: undefined,
    pendingCoin: undefined,
    animationKind: undefined,
    animationCoinDelta: undefined,
  },
  states: {
    inactive: {
      on: {
        SYNC: [
          {
            guard: "sessionWantsCoinTracking",
            target: "watching",
            actions: "setBaselineFromSync",
          },
          { actions: "clearTracking" },
        ],
      },
    },
    watching: {
      on: {
        SYNC: [
          {
            guard: "lostTracking",
            target: "inactive",
            actions: "clearTracking",
          },
          {
            guard: "shouldAnimateCoinGain",
            target: "animating",
            actions: "enterAnimatingGain",
          },
          {
            guard: "shouldAnimateCoinLoss",
            target: "animating",
            actions: "enterAnimatingLoss",
          },
          {
            guard: "coinIncreasedWithoutAnimation",
            actions: "setPreviousFromSync",
          },
          {
            guard: "coinDecreasedWithoutAnimation",
            actions: "setPreviousFromSync",
          },
        ],
      },
    },
    animating: {
      on: {
        SYNC: [
          {
            guard: "lostTracking",
            target: "inactive",
            actions: "clearTracking",
          },
          { actions: "mergePendingWhileAnimating" },
        ],
        ANIMATION_FINISHED: {
          target: "watching",
          actions: "finishAnimation",
        },
      },
    },
  },
})
