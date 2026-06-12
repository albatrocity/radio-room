import { assign, setup } from "xstate"
import type { MyPollVote, Poll, PollHistoryEntry, PollResults } from "@repo/types/Poll"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { toast } from "../lib/toasts"

// ============================================================================
// Types
// ============================================================================

export interface PollContext {
  activePoll: Poll | null
  myVote: MyPollVote | null
  /** Vote held before an optimistic CAST_VOTE, restored on POLL_VOTE_FAILED */
  rollbackVote: MyPollVote | null
  /** True between CAST_VOTE and POLL_VOTE_CONFIRMED / POLL_VOTE_FAILED */
  votePending: boolean
  /** null when poll.settings.hideRunningTotal === true */
  totalVotes: number | null
  /** Set during the ~10s closed-poll reveal window */
  revealResults: PollResults | null
  history: PollHistoryEntry[]
  seenAnimations: Set<string>
  subscriptionId: string | null
}

type PollEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "INIT"
      data: {
        activePoll?: Poll | null
        myVote?: MyPollVote | null
        totalVotes?: number | null
        pollHistory?: PollHistoryEntry[]
      }
    }
  | {
      type: "ROOM_DATA"
      data: {
        activePoll?: Poll | null
        totalVotes?: number | null
        pollHistorySince?: PollHistoryEntry[]
      }
    }
  | { type: "POLL_PUBLISHED"; data: { poll: Poll } }
  | { type: "POLL_VOTE_CAST"; data: { pollId: string; totalVotes: number | null } }
  | {
      type: "POLL_VOTE_CONFIRMED"
      data: { pollId: string; optionId: string; isSwap: boolean }
    }
  | { type: "POLL_VOTE_FAILED"; data: { pollId: string; reason: string } }
  | { type: "POLL_CLOSED"; data: { poll: Poll; results: PollResults } }
  | { type: "POLL_DELETED"; data: { pollId: string } }
  | { type: "CAST_VOTE"; data: { pollId: string; optionId: string } }
  | { type: "CLEAR_REVEAL" }
  | { type: "MARK_ANIMATION_SEEN"; data: { key: string } }

const VOTE_FAILURE_MESSAGES: Record<string, string> = {
  POLL_CLOSED: "This poll has closed.",
  POLL_NOT_FOUND: "Poll not found.",
  INVALID_OPTION: "Invalid option.",
  UNAUTHORIZED: "You must be logged in to vote.",
}

function initialTotalVotes(poll: Poll | null, providedTotal?: number | null): number | null {
  if (!poll) return null
  if (poll.settings.hideRunningTotal) return null
  // Use provided total from INIT/ROOM_DATA if available, otherwise default to 0
  return providedTotal ?? 0
}

function mergeHistory(
  existing: PollHistoryEntry[],
  incoming: PollHistoryEntry[],
): PollHistoryEntry[] {
  if (incoming.length === 0) return existing
  const byId = new Map(existing.map((entry) => [entry.poll.id, entry]))
  for (const entry of incoming) {
    byId.set(entry.poll.id, entry)
  }
  return [...byId.values()].sort(
    (a, b) => (b.poll.closedAt ?? b.poll.publishedAt) - (a.poll.closedAt ?? a.poll.publishedAt),
  )
}

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const pollMachine = setup({
  types: {
    context: {} as PollContext,
    events: {} as PollEvent,
  },
  guards: {
    isActivePollVote: ({ context, event }) => {
      if (event.type !== "POLL_VOTE_CONFIRMED") return false
      return event.data.pollId === context.activePoll?.id
    },
    isActivePollVoteCast: ({ context, event }) => {
      if (event.type !== "POLL_VOTE_CAST") return false
      return event.data.pollId === context.activePoll?.id
    },
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `poll-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as PollEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    hydrateFromInit: assign(({ event }) => {
      if (event.type !== "INIT") return {}
      const activePoll = event.data.activePoll ?? null
      return {
        activePoll,
        myVote: event.data.myVote ?? null,
        rollbackVote: null,
        votePending: false,
        totalVotes: initialTotalVotes(activePoll, event.data.totalVotes),
        revealResults: null,
        history: event.data.pollHistory ?? [],
      }
    }),
    applyRoomData: assign(({ context, event }) => {
      if (event.type !== "ROOM_DATA") return {}
      const updates: Partial<PollContext> = {}
      if ("activePoll" in event.data) {
        const activePoll = event.data.activePoll ?? null
        updates.activePoll = activePoll
        updates.totalVotes = initialTotalVotes(activePoll, event.data.totalVotes)
        if (!activePoll) {
          updates.myVote = null
          updates.rollbackVote = null
          updates.votePending = false
          updates.revealResults = null
        }
      }
      if (event.data.pollHistorySince?.length) {
        updates.history = mergeHistory(context.history, event.data.pollHistorySince)
      }
      return updates
    }),
    setPublishedPoll: assign(({ event }) => {
      if (event.type !== "POLL_PUBLISHED") return {}
      const poll = event.data.poll
      return {
        activePoll: poll,
        myVote: null,
        rollbackVote: null,
        votePending: false,
        revealResults: null,
        totalVotes: initialTotalVotes(poll),
      }
    }),
    setVoteCastTotal: assign(({ event }) => {
      if (event.type !== "POLL_VOTE_CAST") return {}
      if (event.data.totalVotes === null) return {}
      return { totalVotes: event.data.totalVotes }
    }),
    confirmVote: assign(({ event }) => {
      if (event.type !== "POLL_VOTE_CONFIRMED") return {}
      return {
        myVote: {
          pollId: event.data.pollId,
          optionId: event.data.optionId,
          votedAt: Date.now(),
        },
        rollbackVote: null,
        votePending: false,
      }
    }),
    rollbackOptimisticVote: assign(({ context, event }) => {
      if (event.type !== "POLL_VOTE_FAILED") return {}
      const message =
        VOTE_FAILURE_MESSAGES[event.data.reason] ?? "Your vote could not be recorded."
      toast({ title: "Vote failed", description: message, type: "error" })
      return {
        myVote: context.rollbackVote,
        rollbackVote: null,
        votePending: false,
      }
    }),
    closeActivePoll: assign(({ context, event }) => {
      if (event.type !== "POLL_CLOSED") return {}
      const entry: PollHistoryEntry = {
        poll: event.data.poll,
        results: event.data.results,
      }
      return {
        activePoll: event.data.poll,
        myVote: null,
        rollbackVote: null,
        votePending: false,
        totalVotes: null,
        revealResults: event.data.results,
        history: mergeHistory(context.history, [entry]),
      }
    }),
    removeFromHistory: assign(({ context, event }) => {
      if (event.type !== "POLL_DELETED") return {}
      return {
        history: context.history.filter((entry) => entry.poll.id !== event.data.pollId),
      }
    }),
    castVoteOptimistic: assign(({ context, event }) => {
      if (event.type !== "CAST_VOTE") return {}
      return {
        rollbackVote: context.myVote,
        votePending: true,
        myVote: {
          pollId: event.data.pollId,
          optionId: event.data.optionId,
          votedAt: Date.now(),
        },
      }
    }),
    emitCastVote: ({ event }) => {
      if (event.type !== "CAST_VOTE") return
      emitToSocket("CAST_POLL_VOTE", {
        pollId: event.data.pollId,
        optionId: event.data.optionId,
      })
    },
    clearReveal: assign({
      activePoll: () => null,
      revealResults: () => null,
    }),
    markAnimationSeen: assign(({ context, event }) => {
      if (event.type !== "MARK_ANIMATION_SEEN") return {}
      const next = new Set(context.seenAnimations)
      next.add(event.data.key)
      return { seenAnimations: next }
    }),
    reset: assign({
      activePoll: () => null,
      myVote: () => null,
      rollbackVote: () => null,
      votePending: () => false,
      totalVotes: () => null,
      revealResults: () => null,
      history: () => [],
      seenAnimations: () => new Set<string>(),
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "poll",
  initial: "idle",
  context: {
    activePoll: null,
    myVote: null,
    rollbackVote: null,
    votePending: false,
    totalVotes: null,
    revealResults: null,
    history: [],
    seenAnimations: new Set<string>(),
    subscriptionId: null,
  },
  states: {
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["reset"],
        },
        INIT: {
          actions: ["hydrateFromInit"],
        },
        ROOM_DATA: {
          actions: ["applyRoomData"],
        },
        POLL_PUBLISHED: {
          actions: ["setPublishedPoll"],
        },
        POLL_VOTE_CAST: {
          guard: "isActivePollVoteCast",
          actions: ["setVoteCastTotal"],
        },
        POLL_VOTE_CONFIRMED: {
          guard: "isActivePollVote",
          actions: ["confirmVote"],
        },
        POLL_VOTE_FAILED: {
          actions: ["rollbackOptimisticVote"],
        },
        POLL_CLOSED: {
          actions: ["closeActivePoll"],
        },
        POLL_DELETED: {
          actions: ["removeFromHistory"],
        },
        CAST_VOTE: {
          actions: ["castVoteOptimistic", "emitCastVote"],
        },
        CLEAR_REVEAL: {
          actions: ["clearReveal"],
        },
        MARK_ANIMATION_SEEN: {
          actions: ["markAnimationSeen"],
        },
      },
    },
  },
})
