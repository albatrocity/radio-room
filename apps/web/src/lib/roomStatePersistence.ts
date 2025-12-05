/**
 * Room State Persistence
 *
 * Serializes and rehydrates room-related state to/from session storage.
 * This enables quick reload without waiting for server data.
 */

import { chatActor } from "../actors/chatActor"
import { playlistActor } from "../actors/playlistActor"
import { usersActor } from "../actors/usersActor"
import { reactionsActor } from "../actors/reactionsActor"
import { settingsActor } from "../actors/settingsActor"
import { audioActor } from "../actors/audioActor"

import { ChatMessage } from "../types/ChatMessage"
import { QueueItem } from "../types/Queue"
import { User } from "../types/User"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"
import { RoomMeta } from "../types/Room"

// ============================================================================
// Types
// ============================================================================

interface ChatContext {
  messages: ChatMessage[]
}

interface PlaylistContext {
  playlist: QueueItem[]
}

interface UsersContext {
  users: User[]
  listeners: User[]
  dj: User | null
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
  pluginConfigs: Record<string, Record<string, unknown>>
}

interface AudioContextData {
  volume: number
  meta?: RoomMeta
  mediaSourceStatus: "online" | "offline" | "connecting" | "unknown"
  participationStatus: "listening" | "participating"
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

// ============================================================================
// Constants
// ============================================================================

const ROOM_STATE_KEY = "room_state"
const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

// ============================================================================
// Persist State
// ============================================================================

/**
 * Persist the current room state to session storage.
 */
export function persistRoomState(roomId: string): void {
  try {
    const state: PersistedRoomState = {
      roomId,
      timestamp: Date.now(),
      contexts: {
        chat: {
          messages: chatActor.getSnapshot().context.messages,
        },
        playlist: {
          playlist: playlistActor.getSnapshot().context.playlist,
        },
        users: {
          users: usersActor.getSnapshot().context.users,
          listeners: usersActor.getSnapshot().context.listeners,
          dj: usersActor.getSnapshot().context.dj,
        },
        reactions: {
          reactions: reactionsActor.getSnapshot().context.reactions,
        },
        settings: settingsActor.getSnapshot().context,
        audio: {
          volume: audioActor.getSnapshot().context.volume,
          meta: audioActor.getSnapshot().context.meta,
          mediaSourceStatus: audioActor.getSnapshot().context.mediaSourceStatus,
          participationStatus: audioActor.getSnapshot().context.participationStatus,
        },
      },
    }

    sessionStorage.setItem(ROOM_STATE_KEY, JSON.stringify(state))
    console.log("[RoomState] Persisted state for room:", roomId)
  } catch (error) {
    console.error("[RoomState] Failed to persist state:", error)
  }
}

// ============================================================================
// Rehydrate State
// ============================================================================

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

    // Rehydrate chat
    if (state.contexts.chat.messages.length > 0) {
      chatActor.send({ type: "INIT", data: { messages: state.contexts.chat.messages } })
    }

    // Rehydrate playlist
    if (state.contexts.playlist.playlist.length > 0) {
      playlistActor.send({ type: "PLAYLIST", data: state.contexts.playlist.playlist })
    }

    // Rehydrate users
    if (state.contexts.users.users.length > 0) {
      usersActor.send({ type: "SET_USERS", data: { users: state.contexts.users.users } })
    }

    // Rehydrate reactions
    if (Object.keys(state.contexts.reactions.reactions).length > 0) {
      reactionsActor.send({
        type: "INIT",
        data: { reactions: state.contexts.reactions.reactions },
      })
    }

    // Rehydrate settings
    if (state.contexts.settings.title) {
      settingsActor.send({
        type: "ROOM_SETTINGS",
        data: {
          room: state.contexts.settings,
          pluginConfigs: state.contexts.settings.pluginConfigs,
        },
      })
    }

    // Rehydrate audio (volume is user preference, not room state)
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

// ============================================================================
// Auto-Persistence
// ============================================================================

let persistenceInterval: ReturnType<typeof setInterval> | null = null
let currentRoomId: string | null = null

/**
 * Start auto-persisting room state.
 * Called when entering a room.
 */
export function startAutoSave(roomId: string): void {
  currentRoomId = roomId

  // Persist immediately
  persistRoomState(roomId)

  // Persist on visibility change (tab hidden)
  const handleVisibilityChange = () => {
    if (document.hidden && currentRoomId) {
      persistRoomState(currentRoomId)
    }
  }

  // Persist on beforeunload
  const handleBeforeUnload = () => {
    if (currentRoomId) {
      persistRoomState(currentRoomId)
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange)
  window.addEventListener("beforeunload", handleBeforeUnload)

  // Persist periodically (every 30 seconds)
  persistenceInterval = setInterval(() => {
    if (currentRoomId) {
      persistRoomState(currentRoomId)
    }
  }, 30000)

  // Store cleanup handlers for stopAutoSave
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

  // Final persist before stopping
  if (currentRoomId) {
    persistRoomState(currentRoomId)
  }

  // Clean up event listeners
  const cleanup = (window as any).__roomStateCleanup
  if (cleanup) {
    cleanup()
    delete (window as any).__roomStateCleanup
  }

  currentRoomId = null
}

