/**
 * React Hooks for XState Actors
 *
 * This file provides React hooks that replace the Zustand store hooks.
 * Uses @xstate/react's useSelector for efficient subscriptions.
 *
 * Migration: Replace useXxxStore hooks with these hooks.
 */

import { useSelector } from "@xstate/react"

// Import all actors
import { authActor, sendAuthEvent } from "../actors/authActor"
import { chatActor } from "../actors/chatActor"
import { playlistActor } from "../actors/playlistActor"
import { queueListActor } from "../actors/queueListActor"
import { usersActor } from "../actors/usersActor"
import { reactionsActor } from "../actors/reactionsActor"
import { settingsActor } from "../actors/settingsActor"
import { roomActor } from "../actors/roomActor"
import { audioActor } from "../actors/audioActor"
import { djActor } from "../actors/djActor"
import { adminActor } from "../actors/adminActor"
import { modalsActor } from "../actors/modalsActor"
import { themeActor } from "../actors/themeActor"
import { errorsActor } from "../actors/errorsActor"
import { metadataSourceAuthActor } from "../actors/metadataSourceAuthActor"
import { bookmarkedChatActor } from "../actors/bookmarkedChatActor"
import { chatScrollTargetActor } from "../actors/chatScrollTargetActor"
import { metadataPreferenceActor } from "../actors/metadataPreferenceActor"
import { lobbyActor } from "../actors/lobbyActor"
import type { RoomScheduleSnapshotDTO } from "@repo/types"
import { MetadataSourceType, QueueItem } from "../types/Queue"

import { sortByTimestamp } from "../lib/sortByTimestamp"
import { ChatMessage } from "../types/ChatMessage"
import { ReactionSubject } from "../types/ReactionSubject"
import { Reaction } from "../types/Reaction"
import type { LobbyRoom } from "../machines/lobbyMachine"

/**
 * XState v5: returning `actor.send` from hooks loses `this` when the reference is
 * called as a plain function (e.g. onClick/onSubmit), which mis-routes events or
 * targets stopped child actors.
 */
function boundSendRef<A extends { send: (e: never) => void }>(actor: A) {
  return (event: Parameters<A["send"]>[0]) => {
    actor.send(event)
  }
}

const sendToChat = boundSendRef(chatActor)
const sendToPlaylist = boundSendRef(playlistActor)
const sendToQueueList = boundSendRef(queueListActor)
const sendToUsers = boundSendRef(usersActor)
const sendToReactions = boundSendRef(reactionsActor)
const sendToSettings = boundSendRef(settingsActor)
const sendToRoom = boundSendRef(roomActor)
const sendToAudio = boundSendRef(audioActor)
const sendToDj = boundSendRef(djActor)
const sendToAdmin = boundSendRef(adminActor)
const sendToModals = boundSendRef(modalsActor)
const sendToTheme = boundSendRef(themeActor)
const sendToErrors = boundSendRef(errorsActor)
const sendToMetadataSourceAuth = boundSendRef(metadataSourceAuthActor)
const sendToBookmarks = boundSendRef(bookmarkedChatActor)
const sendToChatScrollTarget = boundSendRef(chatScrollTargetActor)
const sendToMetadataPreference = boundSendRef(metadataPreferenceActor)
const sendToLobby = boundSendRef(lobbyActor)

// ============================================================================
// Auth Hooks
// ============================================================================

export const useCurrentUser = () => {
  return useSelector(authActor, (s) => s.context.currentUser)
}

export const useIsAdmin = () => {
  return useSelector(authActor, (s) => s.context.isAdmin)
}

export const useIsRoomCreator = () => {
  const currentUser = useSelector(authActor, (s) => s.context.currentUser)
  const creator = useSelector(roomActor, (s) => s.context.room?.creator)
  return !!currentUser && !!creator && currentUser.userId === creator
}

export const useIsAuthenticated = () => {
  return useSelector(authActor, (s) => s.matches("authenticated"))
}

export const useIsNewUser = () => {
  return useSelector(authActor, (s) => s.context.isNewUser)
}

export const useAuthState = () => {
  return useSelector(authActor, (s) => s.value)
}

/**
 * Use the module-level `sendAuthEvent` wrapper — never return `authActor.send` unbound
 * (extracting a method drops `this` and mis-routes / breaks delivery in XState v5).
 */
export const useAuthSend = () => sendAuthEvent

export const useAuthInitialized = () => {
  return useSelector(authActor, (s) => s.context.initialized)
}

export const usePasswordError = () => {
  return useSelector(authActor, (s) => s.context.passwordError)
}

// ============================================================================
// Chat Hooks
// ============================================================================

// Stable empty array for selector fallback
const EMPTY_MESSAGES: ChatMessage[] = []

// Cache for sorted messages
let cachedMessages: ChatMessage[] = EMPTY_MESSAGES
let cachedSorted: ChatMessage[] = EMPTY_MESSAGES

export const useChatMessages = () => {
  return useSelector(chatActor, (s) => s.context.messages ?? EMPTY_MESSAGES)
}

export const useSortedChatMessages = () => {
  return useSelector(chatActor, (s) => {
    const messages = s.context.messages ?? EMPTY_MESSAGES
    // Only re-sort if the messages array reference has changed
    if (messages !== cachedMessages) {
      cachedMessages = messages
      cachedSorted = [...messages].sort(sortByTimestamp)
    }
    return cachedSorted
  })
}

export const useChatReady = () => {
  return useSelector(chatActor, (s) => s.matches({ active: "ready" }))
}

export const useChatSend = () => sendToChat

// ============================================================================
// Playlist Hooks
// ============================================================================

export const useCurrentPlaylist = () => {
  return useSelector(playlistActor, (s) => s.context.playlist)
}

export const usePlaylistActive = () => {
  return useSelector(playlistActor, (s) => s.matches({ active: "expanded" }))
}

export const usePlaylistSend = () => sendToPlaylist

// ============================================================================
// Queue List Hooks
// ============================================================================

export const useQueueList = (): QueueItem[] => {
  return useSelector(queueListActor, (s) => s.context.queue)
}

export const useQueueCount = () => {
  return useSelector(queueListActor, (s) => s.context.queue.length)
}

export const useHasQueueItems = () => {
  return useSelector(queueListActor, (s) => s.context.queue.length > 0)
}

export const useQueueListSend = () => sendToQueueList

// ============================================================================
// Users Hooks
// ============================================================================

export const useUsers = () => {
  return useSelector(usersActor, (s) => s.context.users)
}

export const useListeners = () => {
  return useSelector(usersActor, (s) => s.context.listeners)
}

export const useDj = () => {
  return useSelector(usersActor, (s) => s.context.dj)
}

export const useUsersSend = () => sendToUsers

// ============================================================================
// Reactions Hooks
// ============================================================================

// Stable empty references to prevent infinite re-renders
const EMPTY_REACTIONS: Reaction[] = []
const EMPTY_REACTIONS_MAP: Record<string, Reaction[]> = {}

export const useAllReactions = (type: ReactionSubject["type"], id?: ReactionSubject["id"]) => {
  return useSelector(reactionsActor, (s) => {
    if (id) {
      return s.context.reactions[type]?.[id] ?? EMPTY_REACTIONS
    }
    return s.context.reactions[type] ?? EMPTY_REACTIONS_MAP
  })
}

export const useAllReactionsOf = (
  type: ReactionSubject["type"],
  id: ReactionSubject["id"],
): Reaction[] => {
  return useSelector(reactionsActor, (s) => s.context.reactions[type]?.[id] ?? EMPTY_REACTIONS)
}

export const useGetAllReactionsOf = (type: ReactionSubject["type"]) => {
  const reactions = useSelector(reactionsActor, (s) => s.context.reactions[type])
  return (id: ReactionSubject["id"]) => reactions?.[id] ?? EMPTY_REACTIONS
}

export const useReactionsSend = () => sendToReactions

// ============================================================================
// Settings Hooks
// ============================================================================

export const useSettings = () => {
  return useSelector(settingsActor, (s) => s.context)
}

export const useRoomTitle = () => {
  return useSelector(settingsActor, (s) => s.context.title)
}

export const useRoomType = () => {
  return useSelector(settingsActor, (s) => s.context.type)
}

export const useDeputizeOnJoin = () => {
  return useSelector(settingsActor, (s) => s.context.deputizeOnJoin)
}

export const usePluginConfigs = () => {
  return useSelector(settingsActor, (s) => s.context.pluginConfigs)
}

export const useSettingsSend = () => sendToSettings

// ============================================================================
// Room Hooks
// ============================================================================

export const useCurrentRoom = () => {
  return useSelector(roomActor, (s) => s.context.room)
}

export const useRoomScheduleSnapshot = (): RoomScheduleSnapshotDTO | null => {
  return useSelector(roomActor, (s) => s.context.scheduleSnapshot)
}

export const useCurrentRoomHasAudio = () => {
  return useSelector(roomActor, (s) => {
    const type = s.context.room?.type
    return type === "radio" || type === "live"
  })
}

export const useRoomBanner = () => {
  return useSelector(roomActor, (s) => s.context.room?.extraInfo)
}

export const useRoomError = () => {
  return useSelector(roomActor, (s) => s.context.error)
}

export const useRoomCreator = () => {
  return useSelector(roomActor, (s) => s.context.room?.creator)
}

export const useRoomState = () => {
  return useSelector(roomActor, (s) => s.value)
}

export const useRoomSend = () => sendToRoom

// ============================================================================
// Audio Hooks
// ============================================================================

export const useVolume = () => {
  return useSelector(audioActor, (s) => s.context.volume)
}

export const useAudioMeta = () => {
  return useSelector(audioActor, (s) => s.context.meta)
}

export const useNowPlaying = () => {
  return useSelector(audioActor, (s) => s.context.meta?.nowPlaying)
}

export const useMediaSourceStatus = () => {
  return useSelector(audioActor, (s) => s.context.mediaSourceStatus)
}

export const useIsPlaying = () => {
  return useSelector(audioActor, (s) => s.matches({ active: { online: { progress: "playing" } } }))
}

export const useIsMuted = () => {
  return useSelector(audioActor, (s) => s.matches({ active: { online: { volume: "muted" } } }))
}

export const useIsAudioOnline = () => {
  return useSelector(audioActor, (s) => s.matches({ active: "online" }))
}

export const useIsAudioLoading = () => {
  return useSelector(audioActor, (s) =>
    s.matches({ active: { online: { progress: { playing: "loading" } } } }),
  )
}

export const useParticipationStatus = () => {
  return useSelector(audioActor, (s) => s.context.participationStatus)
}

export const useAudioSend = () => sendToAudio

// Aliases for compatibility
export const useIsStationOnline = useIsAudioOnline
export const useStationMeta = useAudioMeta

export const useCurrentTrackId = () => {
  // Use mediaSource.trackId - the stable identity from the streaming source
  return useSelector(audioActor, (s) => s.context.meta?.nowPlaying?.mediaSource?.trackId ?? "")
}

export const useMetadataSourceTrackId = () => {
  return useSelector(audioActor, (s) => s.context.meta?.nowPlaying?.metadataSource?.trackId ?? "")
}

export const useHasTrackData = () => {
  return useSelector(audioActor, (s) => !!s.context.meta?.nowPlaying?.track)
}

// ============================================================================
// DJ Hooks
// ============================================================================

export const useIsDjaying = () => {
  return useSelector(djActor, (s) => s.matches({ active: "djaying" }))
}

export const useIsDeputyDjaying = () => {
  return useSelector(djActor, (s) => s.matches({ active: "deputyDjaying" }))
}

export const useCanAddToQueue = () => {
  return useSelector(
    djActor,
    (s) => s.matches({ active: "djaying" }) || s.matches({ active: "deputyDjaying" }),
  )
}

export const useDjState = () => {
  return useSelector(djActor, (s) => s.value)
}

export const useDjSend = () => sendToDj

// ============================================================================
// Admin Hooks
// ============================================================================

export const useAdminState = () => {
  return useSelector(adminActor, (s) => s.value)
}

export const useIsDeleting = () => {
  return useSelector(adminActor, (s) => s.matches({ active: "deleting" }))
}

export const useAdminSend = () => sendToAdmin

// ============================================================================
// Modals Hooks
// ============================================================================

export const useModalState = () => {
  return useSelector(modalsActor, (s) => s.value)
}

/**
 * Returns the full modals state snapshot for components that need state.matches()
 */
export const useModalsSnapshot = () => {
  return useSelector(modalsActor, (s) => s)
}

export const useIsModalOpen = (modalName: string) => {
  return useSelector(modalsActor, (s) => {
    if (typeof s.value === "string") {
      return s.value === modalName
    }
    // Handle nested states like { settings: "overview" }
    return Object.keys(s.value).includes(modalName)
  })
}

export const useIsAnyModalOpen = () => {
  return useSelector(modalsActor, (s) => !s.matches("closed"))
}

export const useModalsSend = () => sendToModals

// ============================================================================
// Theme Hooks
// ============================================================================

export const useCurrentTheme = () => {
  return useSelector(themeActor, (s) => s.context.theme)
}

export const useThemeSend = () => sendToTheme

// ============================================================================
// Errors Hooks
// ============================================================================

export const useErrors = () => {
  return useSelector(errorsActor, (s) => s.context.errors)
}

export const useErrorsSend = () => sendToErrors

// ============================================================================
// Metadata Source Auth Hooks
// ============================================================================

export const useIsMetadataSourceAuthenticated = () => {
  return useSelector(metadataSourceAuthActor, (s) => s.matches({ active: "authenticated" }))
}

export const useIsMetadataSourceLoading = () => {
  return useSelector(metadataSourceAuthActor, (s) => s.matches({ active: "loading" }))
}

export const useMetadataSourceServiceName = () => {
  return useSelector(metadataSourceAuthActor, (s) => s.context.serviceName)
}

export const useMetadataSourceAuthSend = () => sendToMetadataSourceAuth

// ============================================================================
// Bookmarked Chat Hooks
// ============================================================================

export const useBookmarks = () => {
  return useSelector(bookmarkedChatActor, (s) => s.context.collection)
}

export const useIsBookmarked = (messageTimestamp: string) => {
  return useSelector(bookmarkedChatActor, (s) =>
    s.context.collection.some((msg: ChatMessage) => msg.timestamp === messageTimestamp),
  )
}

export const useBookmarksSend = () => sendToBookmarks

export const useChatScrollTargetSend = () => sendToChatScrollTarget

// ============================================================================
// Metadata Preference Hooks
// ============================================================================

export const useAvailableMetadataSources = () => {
  return useSelector(metadataPreferenceActor, (s) => s.context.availableSources)
}

export const usePreferredMetadataSource = (): MetadataSourceType | undefined => {
  return useSelector(metadataPreferenceActor, (s) => s.context.preferredSource)
}

export const useMetadataPreferenceSend = () => sendToMetadataPreference

// ============================================================================
// Lobby Hooks
// ============================================================================

export const useLobbyRooms = (): LobbyRoom[] => {
  return useSelector(lobbyActor, (s) => s.context.rooms)
}

export const useLobbyError = () => {
  return useSelector(lobbyActor, (s) => s.context.error)
}

export const useLobbyState = () => {
  return useSelector(lobbyActor, (s) => s.value)
}

export const useIsLobbyLoading = () => {
  return useSelector(
    lobbyActor,
    (s) => s.matches({ connected: "loading" }) || s.matches("connecting"),
  )
}

export const useIsLobbyReady = () => {
  return useSelector(lobbyActor, (s) => s.matches({ connected: "ready" }))
}

export const useLobbySend = () => sendToLobby
