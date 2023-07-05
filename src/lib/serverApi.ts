import ky from "ky"
import { Room } from "../types/Room"

const API_URL = process.env.GATSBY_API_URL

export type RoomCreationResponse = { room: Room }
export type CreateRoomParams = {
  room: Pick<Room, "title" | "type">
  challenge: string
  userId: string
}

export const createRoom = async ({
  room,
  challenge,
  userId,
}: CreateRoomParams) => {
  const res = await ky
    .post(`${API_URL}/rooms`, { json: { ...room, userId, challenge } })
    .json()
  return res
}
