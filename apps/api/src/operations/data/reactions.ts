import { compact } from "remeda";
import { pubClient } from "../../lib/redisClients";
import { Reaction, ReactionPayload, ReactionStore } from "../../types/Reaction";
import { ReactionSubject } from "../../types/ReactionSubject";

function makeReactionKey(roomId: string, reaction: ReactionPayload) {
  return `room:${roomId}:reactions:${reaction.reactTo.type}:${reaction.reactTo.id}:${reaction.user.userId}-${reaction.emoji.shortcodes}`;
}

function makeReactionTypeKey(roomId: string, reactTo: ReactionSubject) {
  return `room:${roomId}:reactions_list:${reactTo.type}`;
}

function makeReactionSubjectKey(roomId: string, reactTo: ReactionSubject) {
  return `${makeReactionTypeKey(roomId, reactTo)}:${reactTo.id}`;
}

export async function addReaction(
  roomId: string,
  reaction: ReactionPayload,
  reactTo: ReactionSubject
) {
  try {
    const reactionString = JSON.stringify(reaction);
    const key = makeReactionKey(roomId, reaction);
    const reactionTypeKey = makeReactionTypeKey(roomId, reaction.reactTo);
    const reactionSubjectKey = makeReactionSubjectKey(roomId, reaction.reactTo);
    await pubClient.zAdd(reactionTypeKey, { score: Date.now(), value: key });
    await pubClient.zAdd(reactionSubjectKey, { score: Date.now(), value: key });
    return pubClient.set(key, reactionString);
  } catch (e) {
    console.log(
      "ERROR FROM data/reactions/addReaction",
      roomId,
      reaction,
      reactTo
    );
    console.error(e);
  }
}

export async function removeReaction(
  roomId: string,
  reaction: ReactionPayload,
  reactTo: ReactionSubject
) {
  try {
    const key = makeReactionKey(roomId, reaction);
    const reactionTypeKey = makeReactionTypeKey(roomId, reaction.reactTo);
    const reactionSubjectKey = makeReactionSubjectKey(roomId, reaction.reactTo);
    await pubClient.zRem(reactionTypeKey, key);
    await pubClient.zRem(reactionSubjectKey, key);
    return pubClient.unlink(key);
  } catch (e) {
    console.log(
      "ERROR FROM data/reactions/removeReaction",
      roomId,
      reaction,
      reactTo
    );
    console.error(e);
  }
}

function reduceReactionType(
  acc: ReactionStore["message"],
  cur: ReactionPayload
) {
  acc[cur.reactTo.id] = (acc[cur.reactTo.id] ?? []).concat([
    {
      emoji: cur.emoji.shortcodes,
      user: cur.user.userId,
    },
  ]);
  return acc;
}

export async function getAllRoomReactions(roomId: string) {
  try {
    const messageKeys = await pubClient.zRange(
      makeReactionTypeKey(roomId, { type: "message", id: "" }),
      0,
      -1
    );
    const trackKeys = await pubClient.zRange(
      makeReactionTypeKey(roomId, { type: "track", id: "" }),
      0,
      -1
    );

    const messageStrings = await Promise.all(
      messageKeys.map(async (key) => {
        return await pubClient.get(key);
      })
    );
    const trackStrings = await Promise.all(
      trackKeys.map(async (key) => {
        return await pubClient.get(key);
      })
    );

    const message = compact(messageStrings)
      .map((m) => JSON.parse(m) as ReactionPayload)
      .reduce(reduceReactionType, {} as ReactionStore["message"]);
    const track = compact(trackStrings)
      .map((m) => JSON.parse(m) as ReactionPayload)
      .reduce(reduceReactionType, {} as ReactionStore["track"]);

    return { message, track };
  } catch (e) {
    console.log("ERROR FROM data/reactions/getAllRoomReactions", roomId);
    console.error(e);
  }
}

export async function getReactionsForSubject(
  roomId: string,
  reactTo: ReactionSubject
) {
  try {
    const reactionKeys = await pubClient.zRange(
      makeReactionSubjectKey(roomId, reactTo),
      0,
      -1
    );

    const reactionStrings = await Promise.all(
      reactionKeys.map(async (key) => {
        return await pubClient.get(key);
      })
    );

    return compact(reactionStrings).map((m) => JSON.parse(m) as Reaction);
  } catch (e) {
    console.log("ERROR FROM data/reactions/getAllRoomReactions", roomId);
    console.error(e);
    return [];
  }
}
