import { REACTIONABLE_TYPES } from "../lib/constants";

import {
  addReaction as addReactionData,
  getAllRoomReactions,
  removeReaction as removeReactionData,
  updateUserAttributes,
} from "../operations/data";

import { HandlerConnections } from "../types/HandlerConnections";
import { ReactionSubject } from "../types/ReactionSubject";
import { User } from "../types/User";
import { ReactionPayload } from "../types/Reaction";
import { Emoji } from "../types/Emoji";
import getRoomPath from "../lib/getRoomPath";
import { pubUserJoined } from "../operations/sockets/users";

export async function startListening({ socket, io }: HandlerConnections) {
  const { user, users } = await updateUserAttributes(
    socket.data.userId,
    {
      status: "listening",
    },
    socket.data.roomId
  );
  pubUserJoined({ io }, socket.data.roomId, { user, users });
}

export async function stopListening({ socket, io }: HandlerConnections) {
  const { user, users } = await updateUserAttributes(
    socket.data.userId,
    {
      status: "participating",
    },
    socket.data.roomId
  );
  pubUserJoined({ io }, socket.data.roomId, { user, users });
}

export async function addReaction(
  { io, socket }: HandlerConnections,
  reaction: ReactionPayload
) {
  const { reactTo } = reaction;
  if (REACTIONABLE_TYPES.indexOf(reactTo.type) === -1) {
    return;
  }
  await addReactionData(socket.data.roomId, reaction, reactTo);
  const reactions = await getAllRoomReactions(socket.data.roomId);
  io.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "REACTIONS",
    data: { reactions },
  });
}

export async function removeReaction(
  { io, socket }: HandlerConnections,
  {
    emoji,
    reactTo,
    user,
  }: {
    emoji: Emoji;
    reactTo: ReactionSubject;
    user: User;
  }
) {
  if (REACTIONABLE_TYPES.indexOf(reactTo.type) === -1) {
    return;
  }
  const roomId = socket.data.roomId;
  await removeReactionData(roomId, { emoji, reactTo, user }, reactTo);
  const reactions = await getAllRoomReactions(roomId);

  io.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "REACTIONS",
    data: { reactions },
  });
}
