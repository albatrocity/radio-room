/**
 * Room State Persistence
 *
 * Serializes and rehydrates room-related state to/from session storage.
 * This enables quick reload without waiting for server data.
 *
 * Safari's origin quota is small (~5MB shared). Persist only what rehydrate
 * actually applies, and slim playlist/chat so a long show cannot overflow.
 */

import { chatActor } from "../actors/chatActor"
import { playlistActor } from "../actors/playlistActor"
import { usersActor } from "../actors/usersActor"
import { reactionsActor } from "../actors/reactionsActor"
import { settingsActor } from "../actors/settingsActor"
import { audioActor } from "../actors/audioActor"

import { ChatMessage } from "../types/ChatMessage"
import {
  QueueItem,
  type MetadataSourceAlbum,
  type MetadataSourceExternalResource,
  type MetadataSourceTrack,
  type MetadataSourceUrl,
} from "../types/Queue"
import { User } from "../types/User"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"

interface ChatContext {
  messages: ChatMessage[]
}

interface PlaylistContext {
  playlist: QueueItem[]
}

interface UsersContext {
  users: User[]
  listeners?: User[]
  dj?: User | null
}

interface ReactionsContextData {
  reactions: Record<ReactionSubject["type"], Record<string, Reaction[]>>
}

interface SettingsContextData {
  title: string
  fetchMeta: boolean
  extraInfo: string
  password?: string
  artwork?: string
  deputizeOnJoin: boolean
  enableSpotifyLogin: boolean
  type: string
  radioMetaUrl: string
  radioListenUrl: string
  radioProtocol?: string
  announceUsernameChanges: boolean
  announceNowPlaying: boolean
  /** Persisted for chat image UI; matches room details when rehydrated */
  allowChatImages?: boolean
  pluginConfigs: Record<string, Record<string, unknown>>
}

interface AudioContextData {
  volume: number
  mediaSourceStatus?: "online" | "offline" | "connecting" | "unknown"
  participationStatus?: "listening" | "participating"
}

export interface PersistedRoomState {
  roomId: string
  timestamp: number
  contexts: {
    chat: ChatContext
    playlist: PlaylistContext
    users: UsersContext
    reactions: ReactionsContextData
    settings: SettingsContextData
    audio: AudioContextData
  }
}

const ROOM_STATE_KEY = "room_state"
const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes
export const MAX_PERSISTED_CHAT_MESSAGES = 100
export const MAX_PERSISTED_PLAYLIST_ITEMS = 200

function firstUrls(urls: MetadataSourceUrl[] | undefined): MetadataSourceUrl[] {
  return urls?.[0] ? [urls[0]] : []
}

function slimResource(resource: MetadataSourceExternalResource): MetadataSourceExternalResource {
  return {
    id: resource.id,
    title: resource.title,
    urls: firstUrls(resource.urls),
  }
}

function slimAlbum(album: MetadataSourceAlbum | undefined): MetadataSourceAlbum {
  const base = album ?? {
    id: "",
    title: "",
    urls: [],
    artists: [],
    releaseDate: "",
    releaseDatePrecision: "year" as const,
    totalTracks: 0,
    label: "",
    images: [],
  }
  return {
    ...base,
    urls: firstUrls(base.urls),
    images: firstUrls(base.images),
    artists: (base.artists ?? []).map(slimResource),
  }
}

function slimTrack(track: MetadataSourceTrack): MetadataSourceTrack {
  return {
    ...track,
    urls: firstUrls(track.urls),
    images: firstUrls(track.images),
    artists: (track.artists ?? []).map(slimResource),
    album: slimAlbum(track.album),
  }
}

/** Drop duplicate metadataSources / plugin blobs; keep one artwork URL per entity. */
export function slimQueueItemForPersist(item: QueueItem): QueueItem {
  return {
    title: item.title,
    track: slimTrack(item.track),
    mediaSource: item.mediaSource,
    metadataSource: item.metadataSource,
    addedAt: item.addedAt,
    addedBy: item.addedBy,
    addedDuring: item.addedDuring,
    playedAt: item.playedAt,
    locked: item.locked,
  }
}

export function capTail<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  return items.slice(-max)
}

function slimArtwork(artwork: string | undefined): string | undefined {
  if (!artwork) return undefined
  if (artwork.startsWith("data:") || artwork.length > 2048) return undefined
  return artwork
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = "name" in error ? String(error.name) : ""
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED"
}

function emptyReactions(): ReactionsContextData["reactions"] {
  return { message: {}, track: {} }
}

export function compactPersistedRoomState(state: PersistedRoomState): PersistedRoomState {
  return {
    ...state,
    contexts: {
      ...state.contexts,
      chat: { messages: capTail(state.contexts.chat.messages, 40) },
      playlist: {
        playlist: capTail(state.contexts.playlist.playlist, 80),
      },
      reactions: { reactions: emptyReactions() },
    },
  }
}

function persistableSettings(
  context: ReturnType<typeof settingsActor.getSnapshot>["context"],
): SettingsContextData {
  return {
    title: context.title,
    fetchMeta: context.fetchMeta,
    extraInfo: context.extraInfo ?? "",
    password: context.password,
    artwork: slimArtwork(context.artwork),
    deputizeOnJoin: context.deputizeOnJoin,
    enableSpotifyLogin: context.enableSpotifyLogin,
    type: context.type,
    radioMetaUrl: context.radioMetaUrl ?? "",
    radioListenUrl: context.radioListenUrl ?? "",
    radioProtocol: context.radioProtocol,
    announceUsernameChanges: context.announceUsernameChanges,
    announceNowPlaying: context.announceNowPlaying,
    allowChatImages: context.allowChatImages,
    pluginConfigs: {},
  }
}

function snapshotToPersistedState(roomId: string): PersistedRoomState {
  return {
    roomId,
    timestamp: Date.now(),
    contexts: {
      chat: {
        messages: capTail(
          chatActor.getSnapshot().context.messages,
          MAX_PERSISTED_CHAT_MESSAGES,
        ),
      },
      playlist: {
        playlist: capTail(
          playlistActor.getSnapshot().context.playlist.map(slimQueueItemForPersist),
          MAX_PERSISTED_PLAYLIST_ITEMS,
        ),
      },
      users: {
        users: usersActor.getSnapshot().context.users,
      },
      reactions: {
        reactions: reactionsActor.getSnapshot().context.reactions,
      },
      settings: persistableSettings(settingsActor.getSnapshot().context),
      audio: {
        volume: audioActor.getSnapshot().context.volume,
      },
    },
  }
}

function writeRoomState(state: PersistedRoomState): void {
  try {
    sessionStorage.setItem(ROOM_STATE_KEY, JSON.stringify(state))
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error
    try {
      sessionStorage.setItem(ROOM_STATE_KEY, JSON.stringify(compactPersistedRoomState(state)))
    } catch (retryError) {
      sessionStorage.removeItem(ROOM_STATE_KEY)
      throw retryError
    }
  }
}

/**
 * Persist the current room state to session storage.
 */
export function persistRoomState(roomId: string): void {
  try {
    writeRoomState(snapshotToPersistedState(roomId))
  } catch (error) {
    console.error("[RoomState] Failed to persist state:", error)
  }
}

/**
 * Check if there's valid persisted state for the given room.
 */
export function getPersistedRoomState(roomId: string): PersistedRoomState | null {
  try {
    const stored = sessionStorage.getItem(ROOM_STATE_KEY)
    if (!stored) return null

    const state = JSON.parse(stored) as PersistedRoomState

    // Only rehydrate if same room
    if (state.roomId !== roomId) {
      console.log("[RoomState] Different room, ignoring persisted state")
      return null
    }

    // Only rehydrate if not too stale
    if (Date.now() - state.timestamp > MAX_AGE_MS) {
      console.log("[RoomState] Persisted state too old, ignoring")
      clearPersistedRoomState()
      return null
    }

    return state
  } catch (error) {
    console.error("[RoomState] Failed to read persisted state:", error)
    return null
  }
}

/**
 * Apply persisted state to actors.
 * This should be called before the socket INIT event arrives.
 */
export function applyPersistedRoomState(state: PersistedRoomState): void {
  try {
    console.log("[RoomState] Applying persisted state for room:", state.roomId)

    if (state.contexts.chat.messages.length > 0) {
      chatActor.send({ type: "INIT", data: { messages: state.contexts.chat.messages } })
    }

    if (state.contexts.playlist.playlist.length > 0) {
      playlistActor.send({ type: "PLAYLIST", data: state.contexts.playlist.playlist })
    }

    if (state.contexts.users.users.length > 0) {
      usersActor.send({ type: "SET_USERS", data: { users: state.contexts.users.users } })
    }

    if (Object.keys(state.contexts.reactions.reactions).length > 0) {
      reactionsActor.send({
        type: "INIT",
        data: { reactions: state.contexts.reactions.reactions },
      })
    }

    if (state.contexts.settings.title) {
      const pluginConfigs = state.contexts.settings.pluginConfigs
      settingsActor.send({
        type: "ROOM_SETTINGS",
        data: {
          room: state.contexts.settings,
          ...(pluginConfigs && Object.keys(pluginConfigs).length > 0
            ? { pluginConfigs }
            : {}),
        },
      })
    }

    if (state.contexts.audio.volume !== undefined) {
      audioActor.send({ type: "CHANGE_VOLUME", volume: state.contexts.audio.volume })
    }

    console.log("[RoomState] Successfully applied persisted state")
  } catch (error) {
    console.error("[RoomState] Failed to apply persisted state:", error)
  }
}

/**
 * Clear persisted room state.
 */
export function clearPersistedRoomState(): void {
  sessionStorage.removeItem(ROOM_STATE_KEY)
}

let persistenceInterval: ReturnType<typeof setInterval> | null = null
let currentRoomId: string | null = null

/**
 * Start auto-persisting room state.
 * Called when entering a room.
 */
export function startAutoSave(roomId: string): void {
  currentRoomId = roomId

  persistRoomState(roomId)

  const handleVisibilityChange = () => {
    if (document.hidden && currentRoomId) {
      persistRoomState(currentRoomId)
    }
  }

  const handleBeforeUnload = () => {
    if (currentRoomId) {
      persistRoomState(currentRoomId)
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange)
  window.addEventListener("beforeunload", handleBeforeUnload)

  persistenceInterval = setInterval(() => {
    if (currentRoomId) {
      persistRoomState(currentRoomId)
    }
  }, 30000)

  ;(window as any).__roomStateCleanup = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    window.removeEventListener("beforeunload", handleBeforeUnload)
  }
}

/**
 * Stop auto-persisting room state.
 * Called when leaving a room.
 */
export function stopAutoSave(): void {
  if (persistenceInterval) {
    clearInterval(persistenceInterval)
    persistenceInterval = null
  }

  if (currentRoomId) {
    persistRoomState(currentRoomId)
  }

  const cleanup = (window as any).__roomStateCleanup
  if (cleanup) {
    cleanup()
    delete (window as any).__roomStateCleanup
  }

  currentRoomId = null
}
