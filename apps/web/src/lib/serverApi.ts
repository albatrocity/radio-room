import ky from "ky"
import { Room, RoomSetup } from "../types/Room"
import type { PluginSchemasResponse, PluginSchemaInfo } from "../types/PluginSchema"
import type { PluginComponentStores, PluginComponentState } from "../types/PluginComponent"

const API_URL = import.meta.env.VITE_API_URL

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
  room: RoomSetup
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
  console.log("id", id)
  const res: RoomFindResponse = await api.delete(`rooms/${id}`).json()
  return res
}

export async function logout() {
  const res = await api.post(`logout`).json()
  return res
}

export async function getSessionUser() {
  const res = await api.get(`me`).json()
  return res
}

/**
 * Get all registered plugin schemas
 */
export async function getPluginSchemas(): Promise<PluginSchemasResponse> {
  const res = await api.get(`api/plugins`).json<PluginSchemasResponse>()
  return res
}

/**
 * Get schema for a specific plugin
 */
export async function getPluginSchema(pluginName: string): Promise<PluginSchemaInfo> {
  const res = await api.get(`api/plugins/${pluginName}/schema`).json<PluginSchemaInfo>()
  return res
}

/**
 * Get component states for all plugins in a room.
 * Used to hydrate component stores when joining a room.
 */
export async function getPluginComponentStates(
  roomId: string,
): Promise<{ states: PluginComponentStores }> {
  const res = await api
    .get(`api/rooms/${roomId}/plugins/components`)
    .json<{ states: PluginComponentStores }>()
  return res
}

/**
 * Get component state for a specific plugin in a room.
 */
export async function getPluginComponentState(
  roomId: string,
  pluginName: string,
): Promise<{ state: PluginComponentState }> {
  const res = await api
    .get(`api/rooms/${roomId}/plugins/${pluginName}/components`)
    .json<{ state: PluginComponentState }>()
  return res
}
