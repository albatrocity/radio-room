import sendMessage from "../lib/sendMessage";
import systemMessage from "../lib/systemMessage";
import { isNil, uniqBy } from "remeda";
import { HandlerConnections } from "../types/HandlerConnections";
import { User } from "../types/User";
import getStoredUserSpotifyTokens from "../operations/spotify/getStoredUserSpotifyTokens";
import getRoomPath from "../lib/getRoomPath";
import {
  addOnlineUser,
  findRoom,
  getAllRoomReactions,
  getMessages,
  getRoomUsers,
  getUser,
  isDj,
  saveUser,
  removeOnlineUser,
  getRoomPlaylist,
  getRoomCurrent,
  updateUserAttributes,
  persistRoom,
  addDj,
  disconnectFromSpotify,
  getUserRooms,
  expireUserIn,
  persistUser,
  deleteUser,
  nukeUserRooms,
} from "../operations/data";
import { pubUserJoined } from "../operations/sockets/users";
import { Room } from "../types/Room";
import generateId from "../lib/generateId";
import generateAnonName from "../lib/generateAnonName";
import { THREE_HOURS } from "../lib/constants";

function passwordMatched(
  room: Room | null,
  password?: string,
  userId?: string
) {
  if (userId === room?.creator) {
    return true;
  }
  return !room?.password || room?.password === password;
}

export async function checkPassword(
  { socket, io }: HandlerConnections,
  submittedPassword: string
) {
  const room = await findRoom(socket.data.roomId);

  socket.emit("event", {
    type: "SET_PASSWORD_REQUIREMENT",
    data: {
      passwordRequired: !isNil(room?.password),
      passwordAccepted: room?.password
        ? submittedPassword === room?.password
        : true,
    },
  });
}

export async function submitPassword(
  { socket, io }: HandlerConnections,
  submittedPassword: string
) {
  const room = await findRoom(socket.data.roomId);
  if (!room) {
    socket.emit("event", {
      type: "ERROR",
      data: {
        message: "Room not found",
        status: 404,
      },
    });
    return;
  }

  socket.emit("event", {
    type: "SET_PASSWORD_ACCEPTED",
    data: {
      passwordAccepted: passwordMatched(
        room,
        submittedPassword,
        socket.data.userId
      ),
    },
  });
}

export async function login(
  { socket, io }: HandlerConnections,
  {
    userId: incomingUserId,
    username: incomingUsername,
    password,
    roomId,
  }: {
    userId?: string;
    username?: string;
    password?: string;
    roomId: string;
  }
) {
  const assignedUserId: string | undefined = incomingUserId;
  const session = socket.request.session;
  const room = await findRoom(roomId);

  // Throw an error if the room doesn't exist
  if (!room) {
    socket.emit("event", {
      type: "ERROR",
      data: {
        message: "Room not found",
        status: 404,
      },
    });
    return;
  }

  // Retrieve or setup new user
  const existingUserId = assignedUserId ?? session?.user?.userId;
  const isNew = !assignedUserId && !existingUserId && !session?.user?.username;
  const userId = existingUserId ?? generateId();
  const existingUser = await getUser(userId);
  const username =
    existingUser?.username ??
    session.user?.username ??
    incomingUsername ??
    generateAnonName();

  // Stuff some important data into the socket
  socket.data.username = username;
  socket.data.userId = userId;
  socket.data.roomId = roomId;

  // Save some user details to the session
  session.user = {
    userId,
    username,
    id: socket.id,
  };
  session.save();

  // Join the room
  socket.join(getRoomPath(roomId));

  // Throw an error if the room is password protected and the password is incorrect
  if (!passwordMatched(room, password, userId)) {
    socket.emit("event", {
      type: "UNAUTHORIZED",
      data: {
        message: "Password is incorrect",
        status: 401,
      },
    });
    return;
  }

  // Get room-specific user properties
  const users = await getRoomUsers(roomId);
  const isDeputyDj = room?.deputizeOnJoin ?? (await isDj(roomId, userId));
  const isAdmin = room?.creator === socket.data.userId;

  // Create a new user object
  const newUser = {
    username,
    userId,
    id: socket.id,
    isDj: false,
    isDeputyDj,
    status: "participating" as const,
    connectedAt: new Date().toISOString(),
  };

  const newUsers = uniqBy([...users, newUser], (u) => u.userId);

  // save data to redis
  await addOnlineUser(roomId, userId);
  await saveUser(userId, newUser);
  if (room.deputizeOnJoin) {
    await addDj(roomId, userId);
  }

  // If the admin has logged in, remove expiration of room keys
  if (isAdmin) {
    await persistRoom(roomId);
  }

  // remove expiration of user keys
  await persistUser(userId);

  // Emit events
  pubUserJoined({ io }, socket.data.roomId, { user: newUser, users: newUsers });

  // Get initial data payload for user
  const messages = await getMessages(roomId, 0, 100);
  const playlist = await getRoomPlaylist(roomId);
  const meta = await getRoomCurrent(roomId);
  const allReactions = await getAllRoomReactions(roomId);
  const { accessToken } = await getStoredUserSpotifyTokens(userId);

  socket.emit("event", {
    type: "INIT",
    data: {
      users: newUsers,
      messages,
      meta,
      passwordRequired: !isNil(room?.password),
      playlist: playlist,
      reactions: allReactions,
      user: {
        userId: socket.data.userId,
        username: socket.data.username,
        status: "participating",
        isDeputyDj,
        isAdmin,
      },
      accessToken,
      isNewUser: isNew,
    },
  });
}

export async function changeUsername(
  { socket, io }: HandlerConnections,
  { userId, username }: { userId: User["userId"]; username: User["username"] }
) {
  const user = await getUser(userId);
  const room = await findRoom(socket.data.roomId);
  const oldUsername = user?.username;

  if (user) {
    const { users: newUsers, user: newUser } = await updateUserAttributes(
      userId,
      { username },
      socket.data.roomId
    );

    socket.request.session.user = newUser;
    socket.request.session.save();

    pubUserJoined({ io }, socket.data.roomId, {
      users: newUsers,
      user: newUser,
    });

    // send system message of username change if setting is enabled
    if (room?.announceUsernameChanges) {
      const content = `${oldUsername} transformed into ${username}`;
      sendMessage(
        io,
        socket.data.roomId,
        systemMessage(content, {
          oldUsername,
          userId,
        })
      );
    }
  }
}

export async function disconnect({ socket, io }: HandlerConnections) {
  await removeOnlineUser(socket.data.roomId, socket.data.userId);
  socket.leave(getRoomPath(socket.data.roomId));

  const users = await getRoomUsers(socket.data.roomId);
  const createdRooms = await getUserRooms(socket.data.userId);

  if (createdRooms.length === 0) {
    expireUserIn(socket.data.userId, THREE_HOURS);
  }

  socket.broadcast.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "USER_LEFT",
    data: {
      user: { username: socket.data.username },
      users,
    },
  });
}

export async function getUserSpotifyAuth(
  { socket, io }: HandlerConnections,
  { userId }: { userId?: string }
) {
  // get user's spotify access token from redis
  const { accessToken } = await getStoredUserSpotifyTokens(
    userId ?? socket.data.userId
  );
  io.to(socket.id).emit("event", {
    type: "SPOTIFY_AUTHENTICATION_STATUS",
    data: {
      isAuthenticated: !!accessToken,
      accessToken,
    },
  });
}

export async function logoutSpotifyAuth(
  { socket, io }: HandlerConnections,
  { userId }: { userId?: string } = {}
) {
  disconnectFromSpotify(userId ?? socket.data.userId);
}

export async function nukeUser({ socket, io }: HandlerConnections) {
  const userId = socket.data.userId ?? socket.request.session.user?.userId;
  socket.emit("SESSION_ENDED");
  await disconnectFromSpotify(userId);
  await nukeUserRooms(userId);
  await deleteUser(userId);
  socket.request.session.destroy((err) => {});
}
