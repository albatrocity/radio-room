import { filter, isTruthy } from "remeda"
import { AppContext } from "../../lib/context"
import { Reaction, ReactionPayload, ReactionStore } from "@repo/types/Reaction"
import { ReactionSubject } from "@repo/types/ReactionSubject"

function makeReactionKey(roomId: string, reaction: ReactionPayload) {
  return `room:${roomId}:reactions:${reaction.reactTo.type}:${reaction.reactTo.id}:${reaction.user.userId}-${reaction.emoji.shortcodes}`
}

function makeReactionTypeKey(roomId: string, reactTo: ReactionSubject) {
  return `room:${roomId}:reactions_list:${reactTo.type}`
}

function makeReactionSubjectKey(roomId: string, reactTo: ReactionSubject) {
  return `${makeReactionTypeKey(roomId, reactTo)}:${reactTo.id}`
}

type AddReactionParams = {
  context: AppContext
  roomId: string
  reaction: ReactionPayload
  reactTo: ReactionSubject
}

export async function addReaction({ context, roomId, reaction, reactTo }: AddReactionParams) {
  try {
    const reactionString = JSON.stringify(reaction)
    const key = makeReactionKey(roomId, reaction)
    const reactionTypeKey = makeReactionTypeKey(roomId, reaction.reactTo)
    const reactionSubjectKey = makeReactionSubjectKey(roomId, reaction.reactTo)
    await context.redis.pubClient.zAdd(reactionTypeKey, { score: Date.now(), value: key })
    await context.redis.pubClient.zAdd(reactionSubjectKey, { score: Date.now(), value: key })
    return context.redis.pubClient.set(key, reactionString)
  } catch (e) {
    console.log("ERROR FROM data/reactions/addReaction", roomId, reaction, reactTo)
    console.error(e)
  }
}

type RemoveReactionParams = {
  context: AppContext
  roomId: string
  reaction: ReactionPayload
  reactTo: ReactionSubject
}

export async function removeReaction({ context, roomId, reaction, reactTo }: RemoveReactionParams) {
  try {
    const key = makeReactionKey(roomId, reaction)
    const reactionTypeKey = makeReactionTypeKey(roomId, reaction.reactTo)
    const reactionSubjectKey = makeReactionSubjectKey(roomId, reaction.reactTo)
    await context.redis.pubClient.zRem(reactionTypeKey, key)
    await context.redis.pubClient.zRem(reactionSubjectKey, key)
    return context.redis.pubClient.unlink(key)
  } catch (e) {
    console.log("ERROR FROM data/reactions/removeReaction", roomId, reaction, reactTo)
    console.error(e)
  }
}

function reduceReactionType(acc: ReactionStore["message"], cur: ReactionPayload) {
  acc[cur.reactTo.id] = (acc[cur.reactTo.id] ?? []).concat([
    {
      emoji: cur.emoji.shortcodes,
      user: cur.user.userId,
    },
  ])
  return acc
}

type GetAllRoomReactionsParams = {
  context: AppContext
  roomId: string
}

export async function getAllRoomReactions({ context, roomId }: GetAllRoomReactionsParams) {
  try {
    const messageKeys = await context.redis.pubClient.zRange(
      makeReactionTypeKey(roomId, { type: "message", id: "" }),
      0,
      -1,
    )
    const trackKeys = await context.redis.pubClient.zRange(
      makeReactionTypeKey(roomId, { type: "track", id: "" }),
      0,
      -1,
    )

    const messageStrings = await Promise.all(
      messageKeys.map(async (key) => {
        return await context.redis.pubClient.get(key)
      }),
    )
    const trackStrings = await Promise.all(
      trackKeys.map(async (key) => {
        return await context.redis.pubClient.get(key)
      }),
    )

    const message = filter(messageStrings, isTruthy)
      .map((m) => JSON.parse(m) as ReactionPayload)
      .reduce(reduceReactionType, {} as ReactionStore["message"])
    const track = filter(trackStrings, isTruthy)
      .map((m) => JSON.parse(m) as ReactionPayload)
      .reduce(reduceReactionType, {} as ReactionStore["track"])

    return { message, track }
  } catch (e) {
    console.log("ERROR FROM data/reactions/getAllRoomReactions", roomId)
    console.error(e)
  }
}

type GetReactionsForSubjectParams = {
  context: AppContext
  roomId: string
  reactTo: ReactionSubject
}

export async function getReactionsForSubject({
  context,
  roomId,
  reactTo,
}: GetReactionsForSubjectParams) {
  try {
    const reactionKeys = await context.redis.pubClient.zRange(
      makeReactionSubjectKey(roomId, reactTo),
      0,
      -1,
    )

    const reactionStrings = await Promise.all(
      reactionKeys.map(async (key) => {
        return await context.redis.pubClient.get(key)
      }),
    )

    return filter(reactionStrings, isTruthy).map((m) => JSON.parse(m) as Reaction)
  } catch (e) {
    console.log("ERROR FROM data/reactions/getAllRoomReactions", roomId)
    console.error(e)
    return []
  }
}
