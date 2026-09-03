/**
 * React Hooks for XState Actors
 *
 * This file provides React hooks that replace the Zustand store hooks.
 * Uses @xstate/react's useSelector for efficient subscriptions.
 *
 * Migration: Replace useXxxStore hooks with these hooks.
 */

import { useSelector } from "@xstate/react"

import { physicalMediaFramesEnabled } from "../lib/physicalMediaArtwork"

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
import { trackPreviewActor } from "../actors/trackPreviewActor"
import type { TrackPreviewStatus } from "../machines/trackPreviewMachine"
import { djActor } from "../actors/djActor"
import { adminActor } from "../actors/adminActor"
import { gameSessionActor } from "../actors/gameSessionActor"
import {
  userGameStateActor,
  refreshUserGameState,
  refreshStoredArtifacts,
  type UserGameStatePayload,
} from "../actors/userGameStateActor"
import {
  adminListenerStateActor,
  refreshAdminListenerState,
  type AllListenerGameStatesPayload,
} from "../actors/adminListenerStateActor"
import { roomGameStateActor } from "../actors/roomGameStateActor"
import { sharedTickerActor } from "../actors/sharedTickerActor"
import type { GameStateModifier } from "@repo/types"
import { matchesModals, isModalsIdle } from "../lib/modalsState"
import { modalsActor } from "../actors/modalsActor"
import { themeActor } from "../actors/themeActor"
import { errorsActor } from "../actors/errorsActor"
import { metadataSourceAuthActor } from "../actors/metadataSourceAuthActor"
import { bookmarkedChatActor } from "../actors/bookmarkedChatActor"
import { chatScrollTargetActor } from "../actors/chatScrollTargetActor"
import { metadataPreferenceActor } from "../actors/metadataPreferenceActor"
import { lobbyActor } from "../actors/lobbyActor"
import { pollActor } from "../actors/pollActor"
import { feedbackActor } from "../actors/feedbackActor"
import { quickAccessPanelsActor } from "../actors/quickAccessPanelsActor"
import { addToQueueUiActor } from "../actors/addToQueueUiActor"
import { gameStateNavActor } from "../actors/gameStateNavActor"
import {
  notificationsActor,
  surfaceHasNotifications,
  tabNotificationIds,
} from "../actors/notificationsActor"
import { currentDetailFrame } from "../machines/gameStateNavMachine"
import { mediaBridgeActor } from "../actors/mediaBridgeActor"
import type { NotificationSurface } from "../types/Notification"
import {
  effectiveMetadataSourcesActor,
  refreshEffectiveMetadataSources,
} from "../actors/effectiveMetadataSourcesActor"
import type { MetadataBrowseCapabilities, PhysicalMediaItem } from "@repo/types"
import type { RoomScheduleSnapshotDTO } from "@repo/types"
import { MetadataSourceType, QueueItem } from "../types/Queue"

import { sortByTimestamp } from "../lib/sortByTimestamp"
import { ChatMessage } from "../types/ChatMessage"
import type { User } from "../types/User"
import { ReactionSubject } from "../types/ReactionSubject"
import { Reaction } from "../types/Reaction"
import type { LobbyRoom } from "../machines/lobbyMachine"
import { useMemo } from "react"

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
const sendToAdminListener = boundSendRef(adminListenerStateActor)
const sendToPoll = boundSendRef(pollActor)
const sendToFeedback = boundSendRef(feedbackActor)
const sendToQuickAccessPanels = boundSendRef(quickAccessPanelsActor)
const sendToAddToQueueUi = boundSendRef(addToQueueUiActor)
const sendToMediaBridge = boundSendRef(mediaBridgeActor)
const sendToGameStateNav = boundSendRef(gameStateNavActor)

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

/** App-controlled queue: drag handles for room admins (creator or designated admins). */
export const useCanReorderQueue = () => {
  const room = useSelector(roomActor, (s) => s.context.room)
  const isAdmin = useSelector(authActor, (s) => s.context.isAdmin)
  return useMemo(() => {
    if (room?.playbackMode !== "app-controlled") return false
    return isAdmin
  }, [room?.playbackMode, isAdmin])
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

// Cache for sorted messages (invalidated when messages change or expiry bucket ticks)
let cachedMessages: ChatMessage[] = EMPTY_MESSAGES
let cachedSorted: ChatMessage[] = EMPTY_MESSAGES
let cachedExpiryBucket = -1
let cachedHasExpirable = false

export const useChatMessages = () => {
  return useSelector(chatActor, (s) => s.context.messages ?? EMPTY_MESSAGES)
}

/**
 * Whether any chat message currently has an expiresAt (ephemeral previews).
 * Used to gate the 1Hz ticker subscription in useSortedChatMessages.
 */
export const useHasExpirableChatMessages = () => {
  return useSelector(chatActor, (s) =>
    (s.context.messages ?? EMPTY_MESSAGES).some((m) => m.expiresAt != null),
  )
}

export const useSortedChatMessages = () => {
  const hasExpirable = useHasExpirableChatMessages()
  // Gate ticker: when nothing expires, selector returns a constant so ticks do not re-render.
  const now = useSelector(sharedTickerActor, (s) => (hasExpirable ? s.context.now : 0))
  const expiryBucket = Math.floor(now / 1000)

  return useSelector(chatActor, (s) => {
    const messages = s.context.messages ?? EMPTY_MESSAGES

    // Recalculate when messages change
    if (messages !== cachedMessages) {
      cachedMessages = messages
      cachedExpiryBucket = expiryBucket
      cachedHasExpirable = messages.some((m) => m.expiresAt != null)
      cachedSorted = cachedHasExpirable
        ? [...messages]
            .filter((m) => m.expiresAt == null || m.expiresAt > now)
            .sort(sortByTimestamp)
        : [...messages].sort(sortByTimestamp)
      return cachedSorted
    }

    // Only recalculate on tick if there are expirable messages to expire
    if (cachedHasExpirable && expiryBucket !== cachedExpiryBucket) {
      cachedExpiryBucket = expiryBucket
      cachedSorted = [...messages]
        .filter((m) => m.expiresAt == null || m.expiresAt > now)
        .sort(sortByTimestamp)
      // Update flag in case all expirable messages are now gone
      cachedHasExpirable = cachedSorted.some((m) => m.expiresAt != null)
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

/** True when the playlist has at least one track (avoids subscribing to full playlist array). */
export const useHasPlaylistTracks = () => {
  return useSelector(playlistActor, (s) => s.context.playlist.length > 0)
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

export const useQueueSplitKey = (): string | null => {
  return useSelector(queueListActor, (s) => s.context.splitKey)
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

/**
 * `userId -> username` for one `users` array, built once per snapshot and keyed
 * on array identity so every attributed row reads the map instead of scanning it.
 */
const usernamesByUserId = new WeakMap<User[], Map<string, string | undefined>>()

const usernameMapFor = (users: User[]): Map<string, string | undefined> => {
  let map = usernamesByUserId.get(users)
  if (!map) {
    map = new Map(users.map((u) => [u.userId, u.username]))
    usernamesByUserId.set(users, map)
  }
  return map
}

/**
 * Username for one userId. Returns a stable string/undefined so playlist/queue
 * rows do not re-render when unrelated users join, leave, or rename.
 */
export const useUsername = (userId: string | undefined | null): string | undefined => {
  return useSelector(usersActor, (s) => {
    if (!userId) return undefined
    return usernameMapFor(s.context.users).get(userId)
  })
}

export type MentionUserSlice = { userId: string; username: string }

const mentionUsersEqual = (a: MentionUserSlice[], b: MentionUserSlice[]) =>
  a.length === b.length &&
  a.every((u, i) => u.userId === b[i]?.userId && u.username === b[i]?.username)

/** Thin user slice for chat @-mentions (userId + username only). */
export const useUsersForMentions = (): MentionUserSlice[] => {
  return useSelector(
    usersActor,
    (s) =>
      s.context.users.map((u) => ({
        userId: u.userId,
        username: u.username ?? "",
      })),
    mentionUsersEqual,
  )
}

export const useListeners = () => {
  return useSelector(usersActor, (s) => s.context.listeners)
}

export const useDj = () => {
  return useSelector(usersActor, (s) => s.context.dj)
}

export const useAssignablePersonas = () => {
  return useSelector(usersActor, (s) => s.context.assignablePersonas)
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

/** Whether guests may attach images in chat (settings slice only). */
export const useAllowChatImages = () => {
  return useSelector(settingsActor, (s) => s.context.allowChatImages === true)
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

/**
 * Item Shops' Physical Media sleeve toggle, as a boolean so per-row artwork
 * hooks do not re-render on unrelated plugin config changes.
 */
export const usePhysicalMediaFramesEnabled = () => {
  return useSelector(settingsActor, (s) => physicalMediaFramesEnabled(s.context.pluginConfigs))
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

export const useIsPreviewDucked = () => {
  return useSelector(audioActor, (s) => s.context.previewDucked)
}

export const useTrackPreviewStatus = (trackKey: string): TrackPreviewStatus => {
  return useSelector(trackPreviewActor, (s) => {
    if (s.context.trackKey !== trackKey) return "idle"
    return s.context.status
  })
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
// Game Session Hooks
// ============================================================================

export const useActiveGameSessionId = () => {
  return useSelector(gameSessionActor, (s) => s.context.activeSessionId)
}

export const useActiveGameSessionName = () => {
  return useSelector(gameSessionActor, (s) => s.context.activeSessionName)
}

export const useHasActiveGameSession = () => {
  return useSelector(gameSessionActor, (s) => s.context.activeSessionId != null)
}

// ============================================================================
// User Game State Hooks
// ============================================================================

export { refreshUserGameState, refreshStoredArtifacts }
export type { UserGameStatePayload }

export const useUserGameStatePayload = () => {
  return useSelector(userGameStateActor, (s) => s.context.payload)
}

export const useUserGameStateLoading = () => {
  return useSelector(userGameStateActor, (s) => s.matches("loading") || s.matches("refreshing"))
}

export const useUserGameStateError = () => {
  return useSelector(userGameStateActor, (s) => s.context.error)
}

export const useUserGameSession = () => {
  return useSelector(userGameStateActor, (s) => s.context.payload?.session ?? null)
}

export const useUserState = () => {
  return useSelector(userGameStateActor, (s) => s.context.payload?.state ?? null)
}

export const useUserInventory = () => {
  return useSelector(userGameStateActor, (s) => s.context.payload?.inventory ?? null)
}

export const useUserItemDefinitions = () => {
  return useSelector(userGameStateActor, (s) => s.context.payload?.itemDefinitions ?? [])
}

export const useStoredArtifacts = () => {
  return useSelector(userGameStateActor, (s) => s.context.storedArtifacts)
}

// ============================================================================
// Admin listener snapshot (all participants — admin tab only)
// ============================================================================

export { refreshAdminListenerState }
export type { AllListenerGameStatesPayload }

export const useAdminListenerPayload = () => {
  return useSelector(adminListenerStateActor, (s) => s.context.payload)
}

export const useAdminListenerLoading = () => {
  return useSelector(
    adminListenerStateActor,
    (s) => s.matches("loading") || s.matches("refreshing"),
  )
}

export const useAdminListenerError = () => {
  return useSelector(adminListenerStateActor, (s) => s.context.error)
}

export const useAdminListenerSend = () => sendToAdminListener

// ============================================================================
// Room Game State Hooks
// ============================================================================

/** Stable empty array so users with no modifiers don't trigger re-renders. */
const EMPTY_MODIFIERS: GameStateModifier[] = []

/**
 * Modifiers for a single user from the room-wide snapshot. Returns a
 * referentially-stable empty array when the user has no active modifiers,
 * so React equality checks don't churn.
 */
export const useUserModifiers = (userId: string | undefined): GameStateModifier[] => {
  return useSelector(roomGameStateActor, (s) =>
    userId ? (s.context.modifiersByUserId[userId] ?? EMPTY_MODIFIERS) : EMPTY_MODIFIERS,
  )
}

// ============================================================================
// Shared Ticker Hooks
// ============================================================================

/**
 * Subscribe to the shared 1Hz ticker. Use this instead of `setInterval` for
 * low-frequency UI updates (e.g. draining progress bars).
 */
export const useNow = (): number => {
  return useSelector(sharedTickerActor, (s) => s.context.now)
}

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
  return useSelector(modalsActor, (s) => matchesModals(s, modalName))
}

export const useIsAnyModalOpen = () => {
  return useSelector(modalsActor, (s) => !isModalsIdle(s))
}

/** Physical Media item to preselect in Add to Queue → Browse, when deep-linked. */
export const useQueueBrowseMediaKey = (): string | null => {
  return useSelector(modalsActor, (s) => s.context.queueBrowseMediaKey)
}

export {
  useIntegratedPanelPresentation,
  useActiveIntegratedPanelSlot,
  useIntegratedPanelToggle,
  useIsIntegratedPanelSlotOpen,
} from "./useIntegratedPanelPresentation"

export { useRoomLayoutSplitter, useRoomLayoutSizes } from "./useRoomLayoutSplitter"

export const useModalsSend = () => sendToModals

// ============================================================================
// Game State Nav Hooks (ADR 0106)
// ============================================================================

export const useGameStateActiveTab = (): string => {
  return useSelector(gameStateNavActor, (s) => s.context.activeTabId)
}

/** The frame being viewed, or null on a tab index. */
export const useGameStateDetailFrame = () => {
  return useSelector(gameStateNavActor, (s) => currentDetailFrame(s.context))
}

/** True while the Game State modal is showing, i.e. detail frames go on its stack. */
export const useIsGameStateNavActive = (): boolean => {
  return useSelector(gameStateNavActor, (s) => s.matches("active"))
}

export const useGameStateNavSend = () => sendToGameStateNav

// ============================================================================
// Notification Center Hooks (ADR 0144)
// ============================================================================

/** True when any notification targets this surface (entry-point indicator). */
export const useSurfaceHasNotifications = (surface: NotificationSurface): boolean => {
  return useSelector(notificationsActor, (s) => surfaceHasNotifications(s.context, surface))
}

/** Tab ids with active notifications on a surface (default gameState). */
export const useTabNotificationIds = (
  surface: NotificationSurface = "gameState",
): ReadonlySet<string> => {
  return useSelector(notificationsActor, (s) => tabNotificationIds(s.context, surface))
}

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
    s.context.collection.some(
      (msg: ChatMessage & { id?: string }) =>
        msg.id === messageTimestamp || msg.timestamp === messageTimestamp,
    ),
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
// Poll Hooks
// ============================================================================

export const useActivePoll = () => {
  return useSelector(pollActor, (s) => s.context.activePoll)
}

export const useMyPollVote = () => {
  return useSelector(pollActor, (s) => s.context.myVote)
}

export const usePollHistory = () => {
  return useSelector(pollActor, (s) => s.context.history)
}

export const usePollTotalVotes = () => {
  return useSelector(pollActor, (s) => s.context.totalVotes)
}

export const useRevealResults = () => {
  return useSelector(pollActor, (s) => s.context.revealResults)
}

export const useVotePending = () => {
  return useSelector(pollActor, (s) => s.context.votePending)
}

export const usePollSend = () => sendToPoll

export const useFeedbackTopics = () => {
  return useSelector(feedbackActor, (s) => s.context.topics)
}

export const useMyFeedbackResponses = () => {
  return useSelector(feedbackActor, (s) => s.context.myResponses)
}

export const useFeedbackInbox = () => {
  return useSelector(feedbackActor, (s) => s.context.inbox)
}

export const useFeedbackInboxTopics = () => {
  return useSelector(feedbackActor, (s) => s.context.inboxTopics)
}

export const useFeedbackSend = () => sendToFeedback

export const useFeedbackLastFailed = () => {
  return useSelector(feedbackActor, (s) => ({
    topicId: s.context.lastFailedTopicId,
    at: s.context.lastFailedAt,
  }))
}

// ============================================================================
// Quick Access Panels Hooks
// ============================================================================

export const useQuickAccessPanels = () => {
  return useSelector(quickAccessPanelsActor, (s) => s.context.panels)
}

export const useQuickAccessPanelsSend = () => sendToQuickAccessPanels

// ============================================================================
// Add to Queue UI Hooks (ADR 0105)
// ============================================================================

export const useAddToQueueUi = () => {
  return useSelector(addToQueueUiActor, (s) => s.context)
}

export const useAddToQueueUiSend = () => sendToAddToQueueUi

// ============================================================================
// Media Bridge Hooks
// ============================================================================

export const useMediaBridgeConnected = () => {
  return useSelector(mediaBridgeActor, (s) => s.matches({ active: "connected" }))
}

export const useMediaBridgeLinking = () => {
  return useSelector(mediaBridgeActor, (s) => s.matches({ active: "linking" }))
}

/** Daemon CAPABILITIES services when known; null until status includes services. */
export const useMediaBridgeServices = (): string[] | null => {
  return useSelector(mediaBridgeActor, (s) => s.context.services)
}

export const useMediaBridgeSend = () => sendToMediaBridge

// ============================================================================
// Effective metadata sources (ADR 0088 / 0089 / 0090)
// ============================================================================

/** Per-user effective search source ids; null until first server payload. */
export const useEffectiveMetadataSourceIds = (): string[] | null => {
  return useSelector(effectiveMetadataSourcesActor, (s) => s.context.metadataSourceIds)
}

export { refreshEffectiveMetadataSources }

export const useBrowseableMetadataSourceIds = (): string[] | null => {
  return useSelector(effectiveMetadataSourcesActor, (s) => s.context.browseableSourceIds)
}

export const useBrowseSourceCapabilities = (): Record<string, MetadataBrowseCapabilities> => {
  return useSelector(effectiveMetadataSourcesActor, (s) => s.context.browseSourceCapabilities)
}

export const useMyMedia = (): PhysicalMediaItem[] => {
  return useSelector(effectiveMetadataSourcesActor, (s) => s.context.myMedia)
}

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
