import type { AppContext, MyPollVote, Poll, PollHistoryEntry } from "@repo/types"
import {
  getActivePoll,
  getLiveTotalVotes,
  getMyVote,
  getPollHistoryEntries,
  getPollHistorySince,
} from "../data/polls"

export async function loadPollInitData({
  context,
  roomId,
  userId,
}: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<{
  activePoll: Poll | null
  myVote: MyPollVote | null
  totalVotes: number | null
  pollHistory: PollHistoryEntry[]
}> {
  const activePoll = await getActivePoll({ context, roomId })

  let myVote: MyPollVote | null = null
  let totalVotes: number | null = null

  if (activePoll) {
    const optionId = await getMyVote({ context, roomId, pollId: activePoll.id, userId })
    if (optionId) {
      // votedAt is not persisted in Redis; client sets a real timestamp on POLL_VOTE_CONFIRMED
      myVote = { pollId: activePoll.id, optionId, votedAt: 0 }
    }

    // Include live vote count unless hideRunningTotal is enabled
    if (!activePoll.settings.hideRunningTotal) {
      totalVotes = await getLiveTotalVotes({ context, roomId, pollId: activePoll.id })
    }
  }

  const pollHistory = await getPollHistoryEntries({ context, roomId, limit: 20 })

  return { activePoll, myVote, totalVotes, pollHistory }
}

export async function loadPollRoomDataSince({
  context,
  roomId,
  since,
}: {
  context: AppContext
  roomId: string
  since?: number
}): Promise<{
  activePoll: Poll | null
  totalVotes: number | null
  pollHistorySince: PollHistoryEntry[]
}> {
  const activePoll = await getActivePoll({ context, roomId })

  let totalVotes: number | null = null
  if (activePoll && !activePoll.settings.hideRunningTotal) {
    totalVotes = await getLiveTotalVotes({ context, roomId, pollId: activePoll.id })
  }

  const pollHistorySince = await getPollHistorySince({
    context,
    roomId,
    since: since ?? 0,
  })

  return { activePoll, totalVotes, pollHistorySince }
}
