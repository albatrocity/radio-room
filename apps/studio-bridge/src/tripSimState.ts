/**
 * Game Studio trip simulator relay (ADR 0213). Game Studio posts its
 * `TripSimSnapshot` to `POST /trip-sim`; it lives beside the sandbox snapshot so
 * a sandbox `POST /sync` can't drop trip chat. When present it replaces the
 * Road Trip fixture in `stubRoadTrip.ts`.
 */
import type { ChatMessage } from "@repo/types/ChatMessage"
import type { Poll } from "@repo/types/Poll"
import type { TripSimSnapshot } from "@repo/plugin-road-trip/sim"

export type { TripSimSnapshot }

type RoomEvent = { type: string; data: Record<string, unknown> }

const sims = new Map<string, TripSimSnapshot>()

export function getTripSim(roomId: string): TripSimSnapshot | null {
  return sims.get(roomId) ?? null
}

export function isTripSimSnapshot(value: unknown): value is TripSimSnapshot {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<TripSimSnapshot>
  return (
    typeof v.roomId === "string" &&
    typeof v.runId === "string" &&
    typeof v.version === "number" &&
    !!v.store &&
    typeof v.store === "object" &&
    Array.isArray(v.messages)
  )
}

function timestampMs(message: ChatMessage): number {
  const ms = Date.parse(message.timestamp)
  return Number.isFinite(ms) ? ms : 0
}

/** Sandbox chat with the sim's trip lines merged in by time. */
export function mergeTripChat(roomId: string, chat: ChatMessage[]): ChatMessage[] {
  const sim = sims.get(roomId)
  if (!sim || sim.messages.length === 0) return chat
  return [...chat, ...sim.messages].sort((a, b) => timestampMs(a) - timestampMs(b))
}

function closedPollEvent(roomId: string, closing: Poll, next: TripSimSnapshot | null): RoomEvent {
  const now = Date.now()
  const recorded = next?.lastClosedPoll?.poll.id === closing.id ? next.lastClosedPoll : null
  return {
    type: "POLL_CLOSED",
    data: {
      roomId,
      poll: recorded?.poll ?? { ...closing, status: "closed", closedAt: now },
      results: recorded?.results ?? {
        pollId: closing.id,
        totalVotes: 0,
        optionTallies: {},
        winners: [],
        closedAt: now,
      },
    },
  }
}

/**
 * Store the sim's latest snapshot (or clear it with `null`) and work out what
 * the room needs to hear, in order: poll closes and opens, chat lines added or
 * dropped (a reset or a new run drops the old run's lines), and the store.
 * `fallbackStore` is what the room shows once the sim is cleared.
 */
export function setTripSim(
  roomId: string,
  next: TripSimSnapshot | null,
  fallbackStore: () => Record<string, unknown>,
): RoomEvent[] {
  const prev = sims.get(roomId) ?? null
  if (next) sims.set(roomId, next)
  else sims.delete(roomId)

  const events: RoomEvent[] = []
  const prevPoll = prev?.poll ?? null
  const nextPoll = next?.poll ?? null
  if (prevPoll && prevPoll.id !== nextPoll?.id) {
    events.push(closedPollEvent(roomId, prevPoll, next))
  }

  const sameRun = !!prev && !!next && prev.runId === next.runId
  events.push({
    type: "PLUGIN:road-trip:TRIP_UPDATED",
    data: next ? next.store : fallbackStore(),
  })

  if (!sameRun) {
    for (const message of prev?.messages ?? []) {
      events.push({ type: "MESSAGE_DELETED", data: { roomId, timestamp: message.timestamp } })
    }
  }
  const added = sameRun ? next!.messages.slice(prev!.messages.length) : (next?.messages ?? [])
  for (const message of added) {
    events.push({ type: "MESSAGE_RECEIVED", data: { roomId, message } })
  }

  if (nextPoll && nextPoll.id !== prevPoll?.id) {
    events.push({ type: "POLL_PUBLISHED", data: { roomId, poll: nextPoll } })
  }

  return events
}

/** Test seam. */
export function resetTripSims(): void {
  sims.clear()
}
