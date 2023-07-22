import ky from "ky"
import { Room } from "../types/Room"
const API_URL = process.env.GATSBY_API_URL

const api = ky.create({
  prefixUrl: API_URL,
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
  retry: 2,
})

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
  const res = await api
    .post(`rooms`, { json: { ...room, userId, challenge } })
    .json()
  return res
}

export async function findRoom(id: Room["id"]) {
  const res: RoomFindResponse = await api.get(`rooms/${id}`).json()
  return res
}

export async function findUserCreatedRooms() {
  const res: RoomFindResponse = await api.get(`rooms`).json()
  return res
}

export async function deleteRoom(id: Room["id"]) {
  const res: RoomFindResponse = await api.delete(`rooms/${id}`).json()
  return res
}

export async function logout() {
  const res = await api.post(`logout`).json()
  return res
}
