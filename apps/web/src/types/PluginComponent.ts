/**
 * Frontend types for plugin components.
 * Mirrors types from @repo/types but without backend dependencies.
 */

// ============================================================================
// Component Areas
// ============================================================================

export type PluginComponentArea =
  | "playlistItem"
  | "nowPlayingInfo"
  | "nowPlayingArt"
  | "nowPlaying"
  | "userListItem"
  | "userList"

// ============================================================================
// Component Definitions
// ============================================================================

interface PluginComponentBase {
  id: string
  area: PluginComponentArea
  enabledWhen?: string
  subscribeTo?: string[]
}

export interface PluginTextComponent extends PluginComponentBase {
  type: "text"
  content: string
  variant?: "default" | "muted" | "bold" | "small"
}

export interface PluginEmojiComponent extends PluginComponentBase {
  type: "emoji"
  emoji: string
  size?: "sm" | "md" | "lg"
}

export interface PluginIconComponent extends PluginComponentBase {
  type: "icon"
  icon: string
  size?: "sm" | "md" | "lg"
  color?: string
}

export interface PluginButtonComponent extends PluginComponentBase {
  type: "button"
  label: string
  icon?: string
  opensModal?: string
  variant?: "solid" | "ghost" | "outline" | "link"
  size?: "sm" | "md" | "lg"
}

export interface PluginLeaderboardComponent extends PluginComponentBase {
  type: "leaderboard"
  dataKey: string
  title?: string
  rowTemplate?: string
  maxItems?: number
  showRank?: boolean
}

export interface PluginModalComponent extends PluginComponentBase {
  type: "modal"
  title: string
  size?: "sm" | "md" | "lg" | "xl"
  children: PluginComponentDefinition[]
}

export type PluginComponentDefinition =
  | PluginTextComponent
  | PluginEmojiComponent
  | PluginIconComponent
  | PluginButtonComponent
  | PluginLeaderboardComponent
  | PluginModalComponent

// ============================================================================
// Schema Types
// ============================================================================

export interface PluginComponentSchema {
  components: PluginComponentDefinition[]
  storeKeys?: string[]
}

export type PluginComponentState = Record<string, unknown>

export interface LeaderboardEntry {
  value: string
  score: number
}

// ============================================================================
// Store Types
// ============================================================================

/**
 * Combined store for all plugin component states.
 * Structure: { [pluginName]: { [storeKey]: value } }
 */
export type PluginComponentStores = Record<string, PluginComponentState>

