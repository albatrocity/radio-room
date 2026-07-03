import type { StoredArtifactPublic } from "@repo/types/Artifacts"
import type { ChatMessage } from "@repo/types/ChatMessage"
import type { GameSession, UserGameState } from "@repo/types/GameSession"
import type { InventoryItem, ItemDefinition } from "@repo/types/Inventory"
import type { Poll, PollHistoryEntry } from "@repo/types/Poll"
import type { QueueItem } from "@repo/types/Queue"
import type { ShoppingSessionInstance } from "@repo/types/ShoppingSession"
import type { User } from "@repo/types/User"

/** Serialized StudioRoom pushed from Game Studio via POST /sync */
export type BridgeSnapshot = {
  roomId: string
  users: User[]
  chat: ChatMessage[]
  queue: QueueItem[]
  activeSession: GameSession | null
  userStates: Record<string, UserGameState>
  inventories: Record<string, InventoryItem[]>
  itemDefinitions: ItemDefinition[]
  pluginConfigs: Record<string, Record<string, unknown>>
  shoppingByUser: Record<string, ShoppingSessionInstance | null>
  /** Password-free listing — mirrors `ArtifactsPluginAPI.getAll()` for Listening Room preview. */
  storedArtifacts: StoredArtifactPublic[]
  /** Optional — when set, included on socket INIT (overrides query-param stub). */
  activePoll?: Poll | null
  pollHistory?: PollHistoryEntry[]
  /** Attached show id for schedule panel preview. */
  showId?: string | null
  /** When set with `showId`, drives `SEGMENT_TRACKS_AVAILABLE` after `SET_ACTIVE_SEGMENT`. */
  segmentTracksStub?: {
    showSegmentId: string
    segmentTitle: string
    count: number
  } | null
  /** App-controlled queue split anchor (canonical key of first track below divider). */
  splitKey?: string | null
}
