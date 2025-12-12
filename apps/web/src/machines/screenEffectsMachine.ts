import { setup, assign } from "xstate"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import type { ScreenEffectTarget, ScreenEffectName } from "@repo/types"

// ============================================================================
// Types
// ============================================================================

export interface ScreenEffect {
  target: ScreenEffectTarget
  targetId?: string
  effect: ScreenEffectName
  duration?: number
}

export interface ScreenEffectsContext {
  queue: ScreenEffect[]
  currentEffect: ScreenEffect | null
  subscriptionId: string | null
}

type ScreenEffectsEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "SCREEN_EFFECT_QUEUED"
      data: {
        target: ScreenEffectTarget
        targetId?: string
        effect: ScreenEffectName
        duration?: number
      }
    }
  | { type: "EFFECT_ENDED" }
  | { type: "EFFECT_ERROR" }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

const defaultContext: ScreenEffectsContext = {
  queue: [],
  currentEffect: null,
  subscriptionId: null,
}

export const screenEffectsMachine = setup({
  types: {
    context: {} as ScreenEffectsContext,
    events: {} as ScreenEffectsEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `screenEffects-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as ScreenEffectsEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    addToQueue: assign(({ context, event }) => {
      if (event.type !== "SCREEN_EFFECT_QUEUED") return {}
      const newEffect: ScreenEffect = {
        target: event.data.target,
        targetId: event.data.targetId,
        effect: event.data.effect,
        duration: event.data.duration,
      }
      return { queue: [...context.queue, newEffect] }
    }),
    playNextEffect: assign(({ context }) => {
      if (context.queue.length === 0) {
        return { currentEffect: null }
      }

      const [next, ...rest] = context.queue

      return {
        queue: rest,
        currentEffect: next,
      }
    }),
    clearCurrentEffect: assign(() => ({
      currentEffect: null,
    })),
    resetScreenEffects: assign(() => defaultContext),
  },
  guards: {
    hasQueuedEffects: ({ context }) => context.queue.length > 0,
    queueIsEmpty: ({ context }) => context.queue.length === 0,
  },
}).createMachine({
  id: "screenEffects",
  initial: "idle",
  context: defaultContext,
  states: {
    // Idle state - not subscribed to socket events (not in a room)
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe", "resetScreenEffects"],
      on: {
        DEACTIVATE: {
          target: "idle",
        },
      },
      initial: "waiting",
      states: {
        // Waiting for screen effects to be queued
        waiting: {
          on: {
            SCREEN_EFFECT_QUEUED: {
              target: "playing",
              actions: ["addToQueue", "playNextEffect"],
            },
          },
        },
        // Playing a screen effect
        playing: {
          on: {
            SCREEN_EFFECT_QUEUED: {
              actions: ["addToQueue"],
            },
            EFFECT_ENDED: [
              {
                target: "playing",
                guard: "hasQueuedEffects",
                actions: ["clearCurrentEffect", "playNextEffect"],
              },
              {
                target: "waiting",
                actions: ["clearCurrentEffect"],
              },
            ],
            EFFECT_ERROR: [
              {
                target: "playing",
                guard: "hasQueuedEffects",
                actions: ["clearCurrentEffect", "playNextEffect"],
              },
              {
                target: "waiting",
                actions: ["clearCurrentEffect"],
              },
            ],
          },
        },
      },
    },
  },
})

