import { Request, Response } from "express";

import { createRoomId, withDefaults } from "../operations/createRoom";
import {
  findRoom as findRoomData,
  deleteRoom as deleteRoomData,
  saveRoom,
  parseRoom,
  removeSensitiveRoomAttributes,
  getUserRooms,
} from "../operations/data";
import { checkUserChallenge } from "../operations/userChallenge";
import { Server, Socket } from "socket.io";
import { getLatestRoomData, getRoomSettings } from "../handlers/roomHanders";
import { RoomSnapshot } from "../types/Room";

export async function create(req: Request, res: Response) {
  const {
    title,
    type,
    radioMetaUrl,
    radioListenUrl,
    challenge,
    userId,
    radioProtocol,
    deputizeOnJoin,
  } = req.body;
  const createdAt = Date.now().toString();
  console.log("radioListenUrl", radioListenUrl);

  try {
    await checkUserChallenge({ challenge, userId });
    const id = createRoomId({ creator: userId, type, createdAt });
    const room = withDefaults({
      title,
      creator: userId,
      type,
      radioMetaUrl,
      radioProtocol,
      radioListenUrl,
      id,
      createdAt,
      deputizeOnJoin,
      lastRefreshedAt: createdAt,
    });
    await saveRoom(room);
    res.send({ room });
  } catch (e) {
    res.statusCode = e === "Unauthorized" ? 401 : 400;
    res.send({ error: e, status: e === "Unauthorized" ? 401 : 400 });
  }
}

export async function findRoom(req: Request, res: Response) {
  const { id } = req.params;

  const room = await findRoomData(id);
  if (room?.id) {
    return res.send({ room: removeSensitiveRoomAttributes(room) });
  }
  res.statusCode = 404;
  return res.send({ room: null });
}

export async function findRooms(req: Request, res: Response) {
  if (!req.session.user?.userId) {
    return res.status(401).send({
      error: "Unauthorized",
    });
  }

  const rooms = await getUserRooms(req.session.user?.userId || "s");

  return res.status(200).send({
    rooms: rooms.map(parseRoom).map(removeSensitiveRoomAttributes),
  });
}

export async function deleteRoom(req: Request, res: Response) {
  if (!req.params.id) {
    res.statusCode = 400;
    return res.send({
      success: false,
      error: "No room id provided",
    });
  }

  const room = await findRoomData(req.params.id);

  if (!room || room.creator !== req.session.user?.userId) {
    res.statusCode = 401;
    return res.send({
      success: false,
      error: "Unauthorized",
    });
  }

  await deleteRoomData(req.params.id);
  return res.send({
    success: true,
    roomId: req.params.id,
  });
}

export default function socketHandlers(socket: Socket, io: Server) {
  socket.on("get room settings", (url: string) =>
    getRoomSettings({ socket, io }),
  );
  socket.on("get latest room data", (snapshot: RoomSnapshot) =>
    getLatestRoomData({ socket, io }, snapshot),
  );
}
