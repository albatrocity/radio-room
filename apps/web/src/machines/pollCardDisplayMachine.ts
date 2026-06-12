import { assign, setup } from "xstate"
import {
  getPollDisplayMode,
  setPollDisplayMode,
  type PollDisplayMode,
} from "../lib/pollDisplayPreference"

export const REVEAL_DURATION_MS = 20_000

export type PollCardDisplayState = "boot" | "expanded" | "collapsed" | "dismissed" | "revealing"

type PersistableMode = "expanded" | "collapsed" | "dismissed"

export interface PollCardDisplayContext {
  roomId: string
  pollId: string | null
  previousMode: PersistableMode
  revealStartedAt: number | null
  /** Resolved once at boot from input.initialMode */
  bootTarget: PersistableMode
}

type PollCardDisplayEvent =
  | { type: "EXPAND" }
  | { type: "COLLAPSE" }
  | { type: "DISMISS" }
  | { type: "POLL_CLOSED" }
  | { type: "NEW_POLL_PUBLISHED"; pollId: string }
  | { type: "HYDRATE"; roomId: string; pollId: string; mode: PollDisplayMode }
  | { type: "REVEAL_TIMEOUT" }

export interface PollCardDisplayInput {
  roomId: string
  pollId: string | null
  initialMode: PollDisplayMode
}

function toMachineMode(mode: PollDisplayMode): PersistableMode {
  if (mode === "hidden") return "dismissed"
  if (mode === "collapsed") return "collapsed"
  return "expanded"
}

function toStorageMode(mode: PersistableMode): PollDisplayMode {
  return mode === "dismissed" ? "hidden" : mode
}

function persistDisplayMode(roomId: string, pollId: string, mode: PersistableMode) {
  if (!roomId || !pollId) return
  setPollDisplayMode(roomId, pollId, toStorageMode(mode))
}

function hydrateInitialState(mode: PollDisplayMode): PersistableMode {
  return toMachineMode(mode)
}

export const pollCardDisplayMachine = setup({
  types: {
    context: {} as PollCardDisplayContext,
    events: {} as PollCardDisplayEvent,
    input: {} as PollCardDisplayInput,
  },
  delays: {
    REVEAL_DURATION: REVEAL_DURATION_MS,
  },
  guards: {
    isNewPoll: ({ context, event }) => {
      if (event.type !== "NEW_POLL_PUBLISHED") return false
      return event.pollId !== context.pollId
    },
    previousWasExpanded: ({ context }) => context.previousMode === "expanded",
    previousWasCollapsed: ({ context }) => context.previousMode === "collapsed",
    previousWasDismissed: ({ context }) => context.previousMode === "dismissed",
  },
  actions: {
    persistExpanded: ({ context }) => {
      if (!context.pollId) return
      persistDisplayMode(context.roomId, context.pollId, "expanded")
    },
    persistCollapsed: ({ context }) => {
      if (!context.pollId) return
      persistDisplayMode(context.roomId, context.pollId, "collapsed")
    },
    persistDismissed: ({ context }) => {
      if (!context.pollId) return
      persistDisplayMode(context.roomId, context.pollId, "dismissed")
    },
    clearRevealTiming: assign({
      revealStartedAt: () => null,
    }),
    setPollContext: assign(({ event }) => {
      if (event.type !== "HYDRATE" && event.type !== "NEW_POLL_PUBLISHED") return {}
      if (event.type === "NEW_POLL_PUBLISHED") {
        return { pollId: event.pollId }
      }
      return {
        roomId: event.roomId,
        pollId: event.pollId,
      }
    }),
    hydrateFromStorage: assign(({ event }) => {
      if (event.type !== "HYDRATE") return {}
      return {
        roomId: event.roomId,
        pollId: event.pollId,
        previousMode: toMachineMode(event.mode),
        revealStartedAt: null,
      }
    }),
    onRevealTimeout: () => {},
  },
}).createMachine({
  id: "pollCardDisplay",
  context: ({ input }) => {
    const bootTarget = hydrateInitialState(input.initialMode)
    return {
      roomId: input.roomId,
      pollId: input.pollId,
      previousMode: bootTarget,
      revealStartedAt: null,
      bootTarget,
    }
  },
  initial: "boot",
  states: {
    boot: {
      always: [
        {
          guard: ({ context }) => context.bootTarget === "expanded",
          target: "expanded",
        },
        {
          guard: ({ context }) => context.bootTarget === "collapsed",
          target: "collapsed",
        },
        { target: "dismissed" },
      ],
    },
    expanded: {
      entry: ["persistExpanded"],
      on: {
        COLLAPSE: "collapsed",
        DISMISS: "dismissed",
        POLL_CLOSED: {
          target: "revealing",
          actions: assign(({ context }) => ({
            previousMode: "expanded" as const,
            revealStartedAt: Date.now(),
          })),
        },
        NEW_POLL_PUBLISHED: {
          guard: "isNewPoll",
          target: "expanded",
          actions: ["setPollContext", "persistExpanded"],
        },
        HYDRATE: [
          {
            guard: ({ event }) =>
              event.type === "HYDRATE" && toMachineMode(event.mode) === "collapsed",
            target: "collapsed",
            actions: ["hydrateFromStorage"],
          },
          {
            guard: ({ event }) =>
              event.type === "HYDRATE" && toMachineMode(event.mode) === "dismissed",
            target: "dismissed",
            actions: ["hydrateFromStorage"],
          },
          {
            guard: ({ event }) => event.type === "HYDRATE",
            target: "expanded",
            actions: ["hydrateFromStorage"],
          },
        ],
      },
    },
    collapsed: {
      entry: ["persistCollapsed"],
      on: {
        EXPAND: "expanded",
        DISMISS: "dismissed",
        POLL_CLOSED: {
          target: "revealing",
          actions: assign({
            previousMode: "collapsed" as const,
            revealStartedAt: () => Date.now(),
          }),
        },
        NEW_POLL_PUBLISHED: {
          guard: "isNewPoll",
          target: "expanded",
          actions: ["setPollContext", "persistExpanded"],
        },
        HYDRATE: [
          {
            guard: ({ event }) =>
              event.type === "HYDRATE" && toMachineMode(event.mode) === "expanded",
            target: "expanded",
            actions: ["hydrateFromStorage"],
          },
          {
            guard: ({ event }) =>
              event.type === "HYDRATE" && toMachineMode(event.mode) === "dismissed",
            target: "dismissed",
            actions: ["hydrateFromStorage"],
          },
          {
            guard: ({ event }) => event.type === "HYDRATE",
            target: "collapsed",
            actions: ["hydrateFromStorage"],
          },
        ],
      },
    },
    dismissed: {
      entry: ["persistDismissed"],
      on: {
        EXPAND: "expanded",
        COLLAPSE: "collapsed",
        POLL_CLOSED: {
          target: "revealing",
          actions: assign({
            previousMode: "dismissed" as const,
            revealStartedAt: () => Date.now(),
          }),
        },
        NEW_POLL_PUBLISHED: {
          guard: "isNewPoll",
          target: "expanded",
          actions: ["setPollContext", "persistExpanded"],
        },
        HYDRATE: [
          {
            guard: ({ event }) =>
              event.type === "HYDRATE" && toMachineMode(event.mode) === "expanded",
            target: "expanded",
            actions: ["hydrateFromStorage"],
          },
          {
            guard: ({ event }) =>
              event.type === "HYDRATE" && toMachineMode(event.mode) === "collapsed",
            target: "collapsed",
            actions: ["hydrateFromStorage"],
          },
          {
            guard: ({ event }) => event.type === "HYDRATE",
            target: "dismissed",
            actions: ["hydrateFromStorage"],
          },
        ],
      },
    },
    revealing: {
      after: {
        REVEAL_DURATION: [
          {
            guard: "previousWasExpanded",
            target: "expanded",
            actions: ["onRevealTimeout", "clearRevealTiming"],
          },
          {
            guard: "previousWasCollapsed",
            target: "collapsed",
            actions: ["onRevealTimeout", "clearRevealTiming"],
          },
          {
            guard: "previousWasDismissed",
            target: "dismissed",
            actions: ["onRevealTimeout", "clearRevealTiming"],
          },
        ],
      },
      on: {
        COLLAPSE: {
          target: "collapsed",
          actions: "clearRevealTiming",
        },
        DISMISS: {
          target: "dismissed",
          actions: "clearRevealTiming",
        },
        EXPAND: {
          target: "expanded",
          actions: "clearRevealTiming",
        },
        REVEAL_TIMEOUT: [
          {
            guard: "previousWasExpanded",
            target: "expanded",
            actions: ["onRevealTimeout", "clearRevealTiming"],
          },
          {
            guard: "previousWasCollapsed",
            target: "collapsed",
            actions: ["onRevealTimeout", "clearRevealTiming"],
          },
          {
            guard: "previousWasDismissed",
            target: "dismissed",
            actions: ["onRevealTimeout", "clearRevealTiming"],
          },
        ],
      },
    },
  },
})

export function readInitialPollDisplayMode(
  roomId: string | undefined,
  pollId: string | undefined,
): PollDisplayMode {
  if (!roomId || !pollId) return "expanded"
  return getPollDisplayMode(roomId, pollId)
}
