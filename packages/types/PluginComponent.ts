/**
 * Plugin Component System Types
 *
 * Allows plugins to define declarative UI components that the frontend
 * can interpret and render without plugin-specific React code.
 */

// ============================================================================
// Placement Areas
// ============================================================================

/**
 * Areas where plugin components can be rendered.
 * Each area corresponds to a specific location in the UI.
 */
export type PluginComponentArea =
  | "playlistItem" // Near timestamp/added-by info for each track
  | "nowPlayingInfo" // Below the now playing release info
  | "nowPlayingArt" // Overlay on the release artwork
  | "nowPlaying" // General now playing area
  | "userListItem" // Next to each user in the user list
  | "userList" // Top/bottom of the user list

// ============================================================================
// Base Component Definition
// ============================================================================

/**
 * Base properties shared by all component types.
 */
interface PluginComponentBase {
  /** Unique identifier for this component within the plugin */
  id: string
  /** Where the component should be rendered */
  area: PluginComponentArea
  /**
   * Config field that controls visibility.
   * If specified, component only shows when this config field is truthy.
   */
  enabledWhen?: string
  /**
   * Plugin events this component subscribes to.
   * Store updates when event payloads contain matching keys.
   */
  subscribeTo?: string[]
}

// ============================================================================
// Component Types
// ============================================================================

/**
 * Text component - renders interpolated text using template syntax.
 *
 * @example
 * ```typescript
 * {
 *   id: "word-count",
 *   type: "text",
 *   area: "userListItem",
 *   content: "{{wordCount}} words",
 *   variant: "muted"
 * }
 * ```
 */
export interface PluginTextComponent extends PluginComponentBase {
  type: "text"
  /**
   * Template string with {{field}} placeholders.
   * Supports formatters: {{field:duration}}, {{field:percentage}}
   */
  content: string
  variant?: "default" | "muted" | "bold" | "small"
}

/**
 * Emoji component - renders an emoji with optional animation.
 */
export interface PluginEmojiComponent extends PluginComponentBase {
  type: "emoji"
  /** Emoji shortcode (e.g., "trophy", "star") */
  emoji: string
  /** Size variant */
  size?: "sm" | "md" | "lg"
}

/**
 * Icon component - renders an icon from a predefined set.
 */
export interface PluginIconComponent extends PluginComponentBase {
  type: "icon"
  /** Icon name from the icon library */
  icon: string
  /** Size variant */
  size?: "sm" | "md" | "lg"
  /** Color (theme color name or hex) */
  color?: string
}

/**
 * Button component - triggers actions like opening modals.
 *
 * @example
 * ```typescript
 * {
 *   id: "open-leaderboard",
 *   type: "button",
 *   area: "userList",
 *   label: "Leaderboard",
 *   icon: "trophy",
 *   opensModal: "leaderboard-modal"
 * }
 * ```
 */
export interface PluginButtonComponent extends PluginComponentBase {
  type: "button"
  /** Button label */
  label: string
  /** Optional icon (displayed before label) */
  icon?: string
  /** ID of modal to open when clicked */
  opensModal?: string
  /** Visual variant */
  variant?: "solid" | "ghost" | "outline" | "link"
  /** Size variant */
  size?: "sm" | "md" | "lg"
}

/**
 * Leaderboard component - renders a sorted list with scores.
 *
 * @example
 * ```typescript
 * {
 *   id: "users-leaderboard",
 *   type: "leaderboard",
 *   area: "userList",
 *   dataKey: "usersLeaderboard",
 *   title: "Top Word Users",
 *   rowTemplate: "{{value}}: {{score}} words",
 *   maxItems: 10
 * }
 * ```
 */
export interface PluginLeaderboardComponent extends PluginComponentBase {
  type: "leaderboard"
  /**
   * Store key containing array of { value, score } objects.
   * Data should be sorted by score (highest first).
   */
  dataKey: string
  /** Optional title displayed above the list */
  title?: string
  /**
   * Template for each row.
   * Available placeholders: {{value}}, {{score}}, {{rank}}
   */
  rowTemplate?: string
  /** Maximum number of items to display */
  maxItems?: number
  /** Show rank numbers (1, 2, 3, etc.) */
  showRank?: boolean
}

/**
 * Modal component - container that can hold other components.
 * Requires a button with `opensModal` pointing to this modal's ID.
 *
 * @example
 * ```typescript
 * {
 *   id: "leaderboard-modal",
 *   type: "modal",
 *   area: "userList",
 *   title: "Special Words Leaderboard",
 *   children: [
 *     { id: "users-lb", type: "leaderboard", ... }
 *   ]
 * }
 * ```
 */
export interface PluginModalComponent extends PluginComponentBase {
  type: "modal"
  /** Modal title */
  title: string
  /** Size of the modal */
  size?: "sm" | "md" | "lg" | "xl"
  /**
   * Child components rendered inside the modal.
   * Note: Children should not include other modals.
   */
  children: PluginComponentDefinition[]
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all possible component definitions.
 */
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

/**
 * Schema returned by plugin.getComponentSchema().
 * Defines all UI components a plugin wants to render.
 */
export interface PluginComponentSchema {
  /** All component definitions */
  components: PluginComponentDefinition[]
  /**
   * Keys in the component store that can be updated by events.
   * When a subscribed event's payload contains a matching key,
   * the store value is updated.
   */
  storeKeys?: string[]
}

/**
 * State returned by plugin.getComponentState().
 * Used to hydrate component stores when a user joins a room.
 */
export type PluginComponentState = Record<string, unknown>

/**
 * Leaderboard entry format used in component stores.
 */
export interface LeaderboardEntry {
  value: string
  score: number
}

