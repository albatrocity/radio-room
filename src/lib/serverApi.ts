import ky from "ky"
import { Room } from "../types/Room"
import { User } from "../types/User"

const API_URL = process.env.GATSBY_API_URL

export type RoomCreationResponse = { room: Room }
export type RoomFindResponse = { room: Room | null }
export type RoomsResponse = { rooms: Room[] }
export type CreateRoomParams = {
  room: Pick<Room, "title" | "type">
  challenge: string
  userId: string
}

export async function createRoom({
  room,
  challenge,
  userId,
}: CreateRoomParams) {
  const res = await ky
    .post(`${API_URL}/rooms`, { json: { ...room, userId, challenge } })
    .json()
  return res
}

export async function findRoom(id: Room["id"]) {
  const res: RoomFindResponse = await ky.get(`${API_URL}/rooms/${id}`).json()
  return res
}

export async function findUserCreatedRooms(userId: User["userId"]) {
  const res: RoomFindResponse = await ky
    .get(`${API_URL}/rooms?creator=${userId}`)
    .json()
  return res
}

export async function deleteRoom(id: Room["id"]) {
  const res: RoomFindResponse = await ky.delete(`${API_URL}/rooms/${id}`).json()
  return res
}
