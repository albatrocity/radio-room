import ky from "ky"
import type { RoomScheduleSnapshotDTO } from "@repo/types"
import { RADIO_SESSION_HEADER, SESSION_ID } from "../constants"
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
export type RoomFindResponse = {
  room: Room | null
  scheduleSnapshot?: RoomScheduleSnapshotDTO | null
}
export type RoomsResponse = { rooms: Room[] }
export type CreateRoomParams = {
  room: RoomSetup
  challenge: string
  userId: string
}

export async function createRoom({ room, challenge, userId }: CreateRoomParams) {
  return api.post(`rooms`, { json: { ...room, userId, challenge } }).json<RoomCreationResponse>()
}

export async function findRoom(id: Room["id"]) {
  const res: RoomFindResponse = await api.get(`rooms/${id}`).json()
  return res
}

export async function findUserCreatedRooms() {
  const res: RoomFindResponse = await api.get(`rooms`).json()
  return res
}

export async function findAllRooms() {
  const res: RoomsResponse = await api.get(`rooms/all`).json()
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

// =============================================================================
// Image Upload
// =============================================================================

export type UploadedImage = {
  id: string
  url: string
}

export type ImageUploadResponse = {
  success: boolean
  images: UploadedImage[]
}

/**
 * Upload images to a room via HTTP multipart form data.
 * Returns array of uploaded image IDs and URLs.
 */
export async function uploadImages(roomId: string, files: File[]): Promise<ImageUploadResponse> {
  const formData = new FormData()
  files.forEach((file) => formData.append("images", file))

  const radioUserId =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_ID) : null

  const res = await ky
    .post(`${API_URL}/api/rooms/${roomId}/images`, {
      body: formData,
      credentials: "include",
      timeout: 60000, // Longer timeout for large uploads
      headers: radioUserId ? { [RADIO_SESSION_HEADER]: radioUserId } : undefined,
    })
    .json<ImageUploadResponse>()

  return res
}

export type ArtworkUploadResponse = {
  success: boolean
  url: string
}

/**
 * Upload a single artwork image for a room (admin-only).
 * Returns the URL where the image is served.
 */
export async function uploadArtwork(roomId: string, file: File): Promise<ArtworkUploadResponse> {
  const formData = new FormData()
  formData.append("artwork", file)

  const res = await ky
    .post(`${API_URL}/api/rooms/${roomId}/artwork`, {
      body: formData,
      credentials: "include",
      timeout: 60000,
    })
    .json<ArtworkUploadResponse>()

  return res
}

// =============================================================================
// Room Export
// =============================================================================

export type ExportFormat = "json" | "markdown"

/**
 * Export room data in the specified format.
 * Returns a Blob that can be downloaded as a file.
 */
export async function exportRoom(roomId: string, format: ExportFormat): Promise<Blob> {
  const res = await api.get(`api/rooms/${roomId}/export`, {
    searchParams: { format },
    timeout: 60000, // Longer timeout for large exports
  })
  return res.blob()
}

/**
 * Download a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
