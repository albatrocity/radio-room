import { Request, Response } from "express"

import { createRoomId, withDefaults } from "../operations/createRoom"
import {
  findRoom as findRoomData,
  deleteRoom as deleteRoomData,
  saveRoom,
  parseRoom,
  removeSensitiveRoomAttributes,
  getUserRooms,
} from "../operations/data"
import { checkUserChallenge } from "../operations/userChallenge"
import { Server } from "socket.io"
import { getLatestRoomData, getRoomSettings } from "../handlers/roomHandlers"
import { RoomSnapshot } from "@repo/types/Room"
import { SocketWithContext } from "../lib/socketWithContext"

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
  } = req.body
  const createdAt = Date.now().toString()
  console.log("radioListenUrl", radioListenUrl)

  const { context } = req

  try {
    await checkUserChallenge({ challenge, userId, context })
    const id = createRoomId({ creator: userId, type, createdAt })
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
    })
    await saveRoom({ context, room })
    res.send({ room })
  } catch (e) {
    console.log("Error creating room:", e)
    res.statusCode = e === "Unauthorized" ? 401 : 400
    res.send({ error: e, status: e === "Unauthorized" ? 401 : 400 })
  }
}

export async function findRoom(req: Request, res: Response) {
  const { id } = req.params
  const { context } = req

  const room = await findRoomData({ context, roomId: id })
  if (room?.id) {
    return res.send({ room: removeSensitiveRoomAttributes(room) })
  }
  res.statusCode = 404
  return res.send({ room: null })
}

export async function findRooms(req: Request, res: Response) {
  const { context } = req
  if (!req.session.user?.userId) {
    return res.status(401).send({
      error: "Unauthorized",
    })
  }

  const rooms = await getUserRooms({ context, userId: req.session.user?.userId || "s" })

  return res.status(200).send({
    rooms: rooms.map(parseRoom).map(removeSensitiveRoomAttributes),
  })
}

export async function deleteRoom(req: Request, res: Response) {
  const { context } = req
  if (!req.params.id) {
    res.statusCode = 400
    return res.send({
      success: false,
      error: "No room id provided",
    })
  }

  const room = await findRoomData({ context, roomId: req.params.id })

  if (!room || room.creator !== req.session.user?.userId) {
    res.statusCode = 401
    return res.send({
      success: false,
      error: "Unauthorized",
    })
  }

  await deleteRoomData({ context, roomId: req.params.id })
  return res.send({
    success: true,
    roomId: req.params.id,
  })
}

export default function socketHandlers(socket: SocketWithContext, io: Server) {
  socket.on("get room settings", (url: string) => getRoomSettings({ socket, io }))
  socket.on("get latest room data", (snapshot: RoomSnapshot) =>
    getLatestRoomData({ socket, io }, snapshot),
  )
}
