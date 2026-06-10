import type { AppContext, MyPollVote, Poll, PollHistoryEntry } from "@repo/types"
import {
  getActivePoll,
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
  pollHistory: PollHistoryEntry[]
}> {
  const activePoll = await getActivePoll({ context, roomId })

  let myVote: MyPollVote | null = null
  if (activePoll) {
    const optionId = await getMyVote({ context, roomId, pollId: activePoll.id, userId })
    if (optionId) {
      // votedAt is not persisted in Redis; client sets a real timestamp on POLL_VOTE_CONFIRMED
      myVote = { pollId: activePoll.id, optionId, votedAt: 0 }
    }
  }

  const pollHistory = await getPollHistoryEntries({ context, roomId, limit: 20 })

  return { activePoll, myVote, pollHistory }
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
  pollHistorySince: PollHistoryEntry[]
}> {
  const activePoll = await getActivePoll({ context, roomId })
  const pollHistorySince = await getPollHistorySince({
    context,
    roomId,
    since: since ?? 0,
  })

  return { activePoll, pollHistorySince }
}
