import {
  AppContext,
  pollSchema,
  type Poll,
  type PollHistoryEntry,
  type PollOption,
  type PollResults,
} from "@repo/types"

// =============================================================================
// Key helpers
// =============================================================================

function activePollIdKey(roomId: string) {
  return `room:${roomId}:polls:active_id`
}

function pollIndexKey(roomId: string) {
  return `room:${roomId}:polls:index`
}

function pollKey(roomId: string, pollId: string) {
  return `room:${roomId}:poll:${pollId}`
}

function votesKey(roomId: string, pollId: string) {
  return `room:${roomId}:poll:${pollId}:votes`
}

function resultsKey(roomId: string, pollId: string) {
  return `room:${roomId}:poll:${pollId}:results`
}

// =============================================================================
// Poll hash serialization
// =============================================================================

function pollToHashFields(poll: Poll): Record<string, string> {
  return {
    id: poll.id,
    roomId: poll.roomId,
    question: poll.question,
    status: poll.status,
    options: JSON.stringify(poll.options),
    settings: JSON.stringify(poll.settings),
    createdAt: String(poll.createdAt),
    createdBy: poll.createdBy,
    publishedAt: String(poll.publishedAt),
    closedAt: poll.closedAt === null ? "" : String(poll.closedAt),
    closesAt: poll.closesAt === null ? "" : String(poll.closesAt),
  }
}

function hashFieldsToPoll(raw: Record<string, string>): Poll | null {
  if (!raw.id || !raw.roomId || !raw.question || !raw.status) {
    return null
  }

  try {
    const parsed = pollSchema.safeParse({
      id: raw.id,
      roomId: raw.roomId,
      question: raw.question,
      status: raw.status,
      options: JSON.parse(raw.options ?? "[]"),
      settings: JSON.parse(raw.settings ?? '{"hideRunningTotal":false}'),
      createdAt: Number(raw.createdAt),
      createdBy: raw.createdBy,
      publishedAt: Number(raw.publishedAt),
      closedAt: raw.closedAt === "" || raw.closedAt === undefined ? null : Number(raw.closedAt),
      closesAt: raw.closesAt === "" || raw.closesAt === undefined ? null : Number(raw.closesAt),
    })
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// =============================================================================
// Pure helper — tally votes into PollResults
// =============================================================================

export function reduceVotesToResults({
  pollId,
  options,
  votes,
  closedAt,
}: {
  pollId: string
  options: PollOption[]
  votes: Record<string, string>
  closedAt: number
}): PollResults {
  const optionTallies: Record<string, number> = {}
  for (const option of options) {
    optionTallies[option.id] = 0
  }

  for (const optionId of Object.values(votes)) {
    if (optionId in optionTallies) {
      optionTallies[optionId] += 1
    }
  }

  const totalVotes = Object.values(votes).length
  let winners: string[] = []

  if (totalVotes > 0) {
    const maxCount = Math.max(...Object.values(optionTallies))
    winners = options.filter((o) => optionTallies[o.id] === maxCount).map((o) => o.id)
  }

  return {
    pollId,
    totalVotes,
    optionTallies,
    winners,
    closedAt,
  }
}

// =============================================================================
// Active poll pointer
// =============================================================================

export async function setActivePollId({
  context,
  roomId,
  pollId,
}: {
  context: AppContext
  roomId: string
  pollId: string
}): Promise<void> {
  await context.redis.pubClient.set(activePollIdKey(roomId), pollId)
}

export async function getActivePollId({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<string | null> {
  return context.redis.pubClient.get(activePollIdKey(roomId))
}

export async function clearActivePollId({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<void> {
  await context.redis.pubClient.del(activePollIdKey(roomId))
}

// =============================================================================
// Poll record
// =============================================================================

export async function writePoll({
  context,
  poll,
}: {
  context: AppContext
  poll: Poll
}): Promise<void> {
  await context.redis.pubClient.hSet(pollKey(poll.roomId, poll.id), pollToHashFields(poll))
}

export async function getPoll({
  context,
  roomId,
  pollId,
}: {
  context: AppContext
  roomId: string
  pollId: string
}): Promise<Poll | null> {
  const raw = await context.redis.pubClient.hGetAll(pollKey(roomId, pollId))
  if (!raw || Object.keys(raw).length === 0) {
    return null
  }
  return hashFieldsToPoll(raw)
}

export async function deletePollKeys({
  context,
  roomId,
  pollId,
}: {
  context: AppContext
  roomId: string
  pollId: string
}): Promise<void> {
  await Promise.all([
    context.redis.pubClient.unlink(pollKey(roomId, pollId)),
    context.redis.pubClient.unlink(votesKey(roomId, pollId)),
    context.redis.pubClient.unlink(resultsKey(roomId, pollId)),
  ])
}

// =============================================================================
// Poll index (history)
// =============================================================================

export async function addPollToIndex({
  context,
  roomId,
  pollId,
  publishedAt,
}: {
  context: AppContext
  roomId: string
  pollId: string
  publishedAt: number
}): Promise<void> {
  await context.redis.pubClient.zAdd(pollIndexKey(roomId), { score: publishedAt, value: pollId })
}

export async function listPollIds({
  context,
  roomId,
  limit = 20,
  offset = 0,
}: {
  context: AppContext
  roomId: string
  limit?: number
  offset?: number
}): Promise<string[]> {
  if (limit <= 0) return []
  return context.redis.pubClient.zRange(pollIndexKey(roomId), offset, offset + limit - 1, {
    REV: true,
  })
}

export async function removePollFromIndex({
  context,
  roomId,
  pollId,
}: {
  context: AppContext
  roomId: string
  pollId: string
}): Promise<void> {
  await context.redis.pubClient.zRem(pollIndexKey(roomId), pollId)
}

// =============================================================================
// Voting
// =============================================================================

export type TryCastVoteResult =
  | { ok: true; isFirstVote: boolean; totalVotes: number | null }
  | { ok: false; reason: "POLL_CLOSED" | "POLL_NOT_FOUND" | "INVALID_OPTION" }

export async function tryCastVote({
  context,
  roomId,
  pollId,
  userId,
  optionId,
}: {
  context: AppContext
  roomId: string
  pollId: string
  userId: string
  optionId: string
}): Promise<TryCastVoteResult> {
  const poll = await getPoll({ context, roomId, pollId })
  if (!poll) {
    return { ok: false, reason: "POLL_NOT_FOUND" }
  }

  if (poll.status !== "open") {
    return { ok: false, reason: "POLL_CLOSED" }
  }

  const validOption = poll.options.some((o) => o.id === optionId)
  if (!validOption) {
    return { ok: false, reason: "INVALID_OPTION" }
  }

  const isFirstVote =
    (await context.redis.pubClient.hSet(votesKey(roomId, pollId), userId, optionId)) === 1

  if (poll.settings.hideRunningTotal) {
    return { ok: true, isFirstVote, totalVotes: null }
  }

  const totalVotes = await context.redis.pubClient.hLen(votesKey(roomId, pollId))
  return { ok: true, isFirstVote, totalVotes }
}

export async function getPollVotes({
  context,
  roomId,
  pollId,
}: {
  context: AppContext
  roomId: string
  pollId: string
}): Promise<Record<string, string>> {
  return context.redis.pubClient.hGetAll(votesKey(roomId, pollId))
}

export async function getMyVote({
  context,
  roomId,
  pollId,
  userId,
}: {
  context: AppContext
  roomId: string
  pollId: string
  userId: string
}): Promise<string | null> {
  const vote = await context.redis.pubClient.hGet(votesKey(roomId, pollId), userId)
  return vote ?? null
}

export async function getLiveTotalVotes({
  context,
  roomId,
  pollId,
}: {
  context: AppContext
  roomId: string
  pollId: string
}): Promise<number> {
  return context.redis.pubClient.hLen(votesKey(roomId, pollId))
}

// =============================================================================
// Results snapshot
// =============================================================================

export async function writeResultsSnapshot({
  context,
  roomId,
  pollId,
  results,
}: {
  context: AppContext
  roomId: string
  pollId: string
  results: PollResults
}): Promise<void> {
  await context.redis.pubClient.set(resultsKey(roomId, pollId), JSON.stringify(results))
}

export async function getResultsSnapshot({
  context,
  roomId,
  pollId,
}: {
  context: AppContext
  roomId: string
  pollId: string
}): Promise<PollResults | null> {
  const poll = await getPoll({ context, roomId, pollId })
  if (!poll || poll.status !== "closed") {
    return null
  }

  const raw = await context.redis.pubClient.get(resultsKey(roomId, pollId))
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as PollResults
  } catch {
    return null
  }
}

// =============================================================================
// Read helpers (INIT / ROOM_DATA snapshots)
// =============================================================================

export async function getActivePoll({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<Poll | null> {
  const pollId = await getActivePollId({ context, roomId })
  if (!pollId) {
    return null
  }

  const poll = await getPoll({ context, roomId, pollId })
  if (!poll || poll.status !== "open") {
    return null
  }

  return poll
}

export async function getPollHistoryEntries({
  context,
  roomId,
  limit = 20,
}: {
  context: AppContext
  roomId: string
  limit?: number
}): Promise<PollHistoryEntry[]> {
  const pollIds = await listPollIds({ context, roomId, limit: 100 })
  const entries: PollHistoryEntry[] = []

  for (const pollId of pollIds) {
    const poll = await getPoll({ context, roomId, pollId })
    if (!poll || poll.status !== "closed") {
      continue
    }

    const results = await getResultsSnapshot({ context, roomId, pollId })
    if (!results) {
      continue
    }

    entries.push({ poll, results })
    if (entries.length >= limit) {
      break
    }
  }

  return entries
}

export async function getPollHistorySince({
  context,
  roomId,
  since,
}: {
  context: AppContext
  roomId: string
  since: number
}): Promise<PollHistoryEntry[]> {
  if (!since || since <= 0) {
    return []
  }

  const pollIds = await listPollIds({ context, roomId, limit: 100 })
  const entries: PollHistoryEntry[] = []

  for (const pollId of pollIds) {
    const poll = await getPoll({ context, roomId, pollId })
    if (!poll || poll.status !== "closed" || poll.closedAt == null || poll.closedAt <= since) {
      continue
    }

    const results = await getResultsSnapshot({ context, roomId, pollId })
    if (!results) {
      continue
    }

    entries.push({ poll, results })
  }

  return entries
}
