import { REACTIONABLE_TYPES } from "../lib/constants"

import {
  addReaction as addReactionData,
  getAllRoomReactions,
  removeReaction as removeReactionData,
  updateUserAttributes,
} from "../operations/data"

import { HandlerConnections } from "@repo/types/HandlerConnections"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { User } from "@repo/types/User"
import { ReactionPayload } from "@repo/types/Reaction"
import { Emoji } from "@repo/types/Emoji"
import getRoomPath from "../lib/getRoomPath"
import { pubUserJoined } from "../operations/sockets/users"

export async function startListening({ socket, io }: HandlerConnections) {
  const { context } = socket
  const { user, users } = await updateUserAttributes({
    context,
    userId: socket.data.userId,
    attributes: {
      status: "listening",
    },
    roomId: socket.data.roomId,
  })

  if (!user) {
    return
  }

  pubUserJoined({ io, roomId: socket.data.roomId, data: { user, users }, context })
}

export async function stopListening({ socket, io }: HandlerConnections) {
  const { context } = socket
  const { user, users } = await updateUserAttributes({
    context,
    userId: socket.data.userId,
    attributes: { status: "participating" },
    roomId: socket.data.roomId,
  })

  if (!user) {
    return
  }

  pubUserJoined({ io, roomId: socket.data.roomId, data: { user, users }, context })
}

export async function addReaction({ io, socket }: HandlerConnections, reaction: ReactionPayload) {
  const { context } = socket
  const { reactTo } = reaction
  if (REACTIONABLE_TYPES.indexOf(reactTo.type) === -1) {
    return
  }
  await addReactionData({ context, roomId: socket.data.roomId, reaction, reactTo })

  const reactions = await getAllRoomReactions({ context, roomId: socket.data.roomId })

  io.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "REACTIONS",
    data: { reactions },
  })
}

export async function removeReaction(
  { io, socket }: HandlerConnections,
  {
    emoji,
    reactTo,
    user,
  }: {
    emoji: Emoji
    reactTo: ReactionSubject
    user: User
  },
) {
  const { context } = socket
  if (REACTIONABLE_TYPES.indexOf(reactTo.type) === -1) {
    return
  }
  const roomId = socket.data.roomId
  await removeReactionData({ context, roomId, reaction: { emoji, reactTo, user }, reactTo })
  const reactions = await getAllRoomReactions({ context, roomId })

  io.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "REACTIONS",
    data: { reactions },
  })
}
