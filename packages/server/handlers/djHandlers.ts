import { HandlerConnections } from "@repo/types"
import { User } from "@repo/types/User"
import { QueueItem } from "@repo/types/Queue"
import { MetadataSource } from "@repo/types"
import { createDJHandlers } from "./djHandlersAdapter"

// Create DJ handlers for each socket connection using the context
export async function djDeputizeUser({ socket, io }: HandlerConnections, userId: User["userId"]) {
  const { context } = socket
  const djHandlers = createDJHandlers(context)
  return djHandlers.djDeputizeUser({ socket, io }, userId)
}

export async function queueSong({ socket, io }: HandlerConnections, id: QueueItem["track"]["id"]) {
  const { context } = socket
  const djHandlers = createDJHandlers(context)
  return djHandlers.queueSong({ socket, io }, id)
}

export async function searchForTrack(
  { socket, io }: HandlerConnections,
  metadataSource: MetadataSource,
  { query }: { query: string },
) {
  const { context } = socket
  const djHandlers = createDJHandlers(context)
  return djHandlers.searchForTrack({ socket, io }, metadataSource, { query })
}

export async function savePlaylist(
  { socket, io }: HandlerConnections,
  metadataSource: MetadataSource,
  { name, trackIds }: { name: string; trackIds: QueueItem["track"]["id"][] },
) {
  const { context } = socket
  const djHandlers = createDJHandlers(context)
  return djHandlers.savePlaylist({ socket, io }, metadataSource, { name, trackIds })
}

export async function handleUserJoined(
  { io, socket }: HandlerConnections,
  { user, users }: { user: User; users: User[] },
) {
  const { context } = socket
  const djHandlers = createDJHandlers(context)
  return djHandlers.handleUserJoined({ socket, io }, { user, users })
}
