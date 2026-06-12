/**
 * Poll Actor
 *
 * Single source of truth for room poll state. Subscribes to socket events on
 * ACTIVATE and resets on DEACTIVATE (see roomLifecycle).
 */

import { createActor } from "xstate"
import { pollMachine } from "../machines/pollMachine"

export const pollActor = createActor(pollMachine).start()

export function getActivePoll() {
  return pollActor.getSnapshot().context.activePoll
}

export function getMyPollVote() {
  return pollActor.getSnapshot().context.myVote
}

export function getPollHistory() {
  return pollActor.getSnapshot().context.history
}

export function getPollTotalVotes() {
  return pollActor.getSnapshot().context.totalVotes
}

/** Latest poll publish/close timestamp for incremental ROOM_DATA sync. */
export function getLastPollChange(): number | undefined {
  const { activePoll, history } = pollActor.getSnapshot().context
  let max = 0

  if (activePoll) {
    max = Math.max(max, activePoll.publishedAt)
  }

  for (const entry of history) {
    max = Math.max(max, entry.poll.publishedAt)
    if (entry.poll.closedAt != null) {
      max = Math.max(max, entry.poll.closedAt)
    }
  }

  return max > 0 ? max : undefined
}
