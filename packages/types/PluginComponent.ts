/**
 * Plugin Component System Types
 *
 * Allows plugins to define declarative UI components that the frontend
 * can interpret and render without plugin-specific React code.
 *
 * Architecture:
 * - Template components define the actual rendering (username, text, emoji, etc.)
 * - Plugin components are template components + placement metadata (area, showWhen)
 * - Frontends implement template components; plugins reference them by name
 */

import type { GameAttributeName } from "./GameSession"

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
  | "nowPlayingBadge" // Badges/indicators next to the now playing title
  | "nowPlaying" // General now playing area
  | "userListItem" // Next to each user in the user list
  | "userList" // Top/bottom of the user list
  | "gameStateTab" // Tab content in the user's game state modal

// ============================================================================
// Template Component System
// ============================================================================

/**
 * Built-in template component names that all frontends must implement.
 * These can be referenced in composite templates and plugin components.
 */
export type TemplateComponentName =
  | "username"
  | "text"
  | "text-block"
  | "heading"
  | "emoji"
  | "icon"
  | "button"
  | "badge"
  | "leaderboard"
  | "countdown"
  | "game-leaderboard"
  | "game-attribute"
  | "modifier-badge"
  | "inventory-button"
  | "inventory-grid"
  | "item-badge"
  | "shop-offer-table"

/**
 * Props for the username template component.
 */
export interface UsernameComponentProps {
  userId: string
  /** Fallback username to display if user is not found in current users list */
  fallback?: string
}

/**
 * Props for the text template component.
 */
export interface TextComponentProps {
  /** Text content - can be a string or CompositeTemplate for embedded components */
  content: string | CompositeTemplate
  variant?: "default" | "muted" | "bold" | "small"
  /** Font size - overrides variant-based sizing */
  size?: "xs" | "sm" | "md" | "lg"
}

/**
 * Props for text-block component (matches PluginSchemaElement text-block).
 * Renders styled text content with optional visual variants.
 */
export interface TextBlockComponentProps {
  /** Content to display - string with {{placeholders}} or CompositeTemplate */
  content: string | CompositeTemplate
  /** Visual variant for the text block */
  variant?: "info" | "warning" | "example"
  /** Font size */
  size?: "xs" | "sm" | "md" | "lg"
}

/**
 * Props for heading component (matches PluginSchemaElement heading).
 */
export interface HeadingComponentProps {
  /** Heading text content */
  content: string | CompositeTemplate
  /** Heading level (visual size) */
  level?: 1 | 2 | 3 | 4
}

/**
 * Props for the emoji template component.
 */
export interface EmojiComponentProps {
  emoji: string
  size?: "xs" | "sm" | "md" | "lg"
}

/**
 * Props for the icon template component.
 */
export interface IconComponentProps {
  icon: string
  size?: "sm" | "md" | "lg"
  color?: string
}

/**
 * Props for the button template component.
 *
 * A button may either open a modal (`opensModal`) or invoke a plugin action
 * (`action`). When `action` is provided, the frontend emits
 * `EXECUTE_PLUGIN_ACTION` so the plugin's `executeAction(action, initiator)`
 * runs server-side with the clicking user as the initiator. Use
 * `confirmMessage` to gate destructive or expensive actions behind a
 * confirmation popover.
 */
export interface ButtonComponentProps {
  label: string
  icon?: string
  opensModal?: string
  /** Plugin action identifier - dispatched via `EXECUTE_PLUGIN_ACTION`. */
  action?: string
  /** If set, the user is asked to confirm before the action runs. */
  confirmMessage?: string
  /** Confirmation button label (defaults to "Confirm"). */
  confirmText?: string
  variant?: "solid" | "ghost" | "outline" | "link"
  size?: "sm" | "md" | "lg"
  /** When true, the button is non-interactive. */
  disabled?: boolean
}

/**
 * Leaderboard entry format.
 */
export interface LeaderboardEntry {
  value: string
  score: number
  username?: string
}

// Forward declare CompositeTemplate (defined below)
export type CompositeTemplate = (TemplateTextPart | TemplateComponentPart)[]

/**
 * Props for the leaderboard template component.
 */
export interface LeaderboardComponentProps {
  dataKey: string
  title?: string
  rowTemplate?: string | CompositeTemplate
  maxItems?: number
  showRank?: boolean
}

/**
 * Props for the countdown template component.
 */
export interface CountdownComponentProps {
  /** Store key containing the start timestamp (ISO string or unix ms) */
  startKey: string
  /** Duration in milliseconds, or config key like "config.timeLimit" */
  duration: number | string
  /**
   * Optional text/instructions to display with the countdown.
   * Can be:
   * - A string with template placeholders like {{config.fieldName}}
   * - A CompositeTemplate array (text mixed with components like emoji)
   */
  text?: string | CompositeTemplate
}

/**
 * Props for the badge template component.
 */
export interface BadgeComponentProps {
  /** Badge label text (supports template interpolation) */
  label: string | CompositeTemplate
  /** Visual variant */
  variant?: "success" | "warning" | "error" | "info"
  /** Icon name (e.g., "skip-forward", "heart", "star") */
  icon?: string
  /** Tooltip text on hover (supports template interpolation) */
  tooltip?: string
}

/**
 * Props for the game-leaderboard template component.
 *
 * Backed by an active game session's `LeaderboardConfig.id`. The frontend
 * subscribes to `GAME_STATE_CHANGED` events to keep entries fresh.
 */
export interface GameLeaderboardComponentProps {
  /** Reference to a `LeaderboardConfig.id` on the active session. */
  leaderboardId: string
  /** Optional title override (defaults to `LeaderboardConfig.displayName`). */
  title?: string
  maxItems?: number
  showRank?: boolean
}

/**
 * Props for the game-attribute template component.
 *
 * Renders a single attribute value for a user (intended for `userListItem`).
 */
export interface GameAttributeComponentProps {
  /**
   * Attribute name (e.g. `"score"`, `"coin"`, `"potion-shop:potions-used"`).
   * Supports template interpolation (`{{userId}}` etc.).
   */
  attribute: string
  /** Display format hint. */
  format?: "number" | "currency" | "health-bar"
  /** Optional icon shown alongside the value. */
  icon?: string
  /** Optional label displayed next to the value. */
  label?: string
}

/**
 * Props for the modifier-badge template component.
 * Shows a badge for the named modifier when active for the contextual user.
 */
export interface ModifierBadgeComponentProps {
  /** Modifier name to watch for (e.g. `"poisoned"`). */
  modifier: string
  /** Visual variant. */
  variant?: "success" | "warning" | "error" | "info"
  /** Optional label/icon overrides. */
  label?: string
  icon?: string
}

/**
 * Props for the inventory-button template component.
 * Opens the inventory grid in a modal when clicked.
 */
export interface InventoryButtonComponentProps {
  label: string
  icon?: string
  /** Modal id to open (must reference a modal containing an inventory-grid). */
  opensModal: string
}

/**
 * Props for the inventory-grid template component.
 *
 * Renders the current user's inventory. Designed to be placed inside a modal.
 */
export interface InventoryGridComponentProps {
  showQuantity?: boolean
  allowUse?: boolean
  allowTrade?: boolean
  /** Optional filter by source plugin. */
  filterSourcePlugin?: string
}

/**
 * Props for the item-badge template component.
 *
 * Renders a small badge on a user list row when the contextual user owns at
 * least one of the referenced item.
 */
export interface ItemBadgeComponentProps {
  /** Fully-qualified `ItemDefinition.id` (e.g. `"potion-shop:speed-potion"`). */
  definitionId: string
  showQuantity?: boolean
}

/** One row in a `shop-offer-table` (game shop / catalog UI). */
export interface ShopOfferTableRow {
  /** Lucide icon key (see frontend `ICON_MAP`, e.g. `disc-2`). */
  icon: string
  name: string
  description: string
  /** Price in `balanceAttribute` units (e.g. coins). Displayed in the UI and used for afford checks. */
  price: number
  /** Plugin component store key for in-stock quantity (e.g. `skipTokenStock`). */
  quantityStoreKey: string
  /** Plugin action dispatched when Buy is clicked (`EXECUTE_PLUGIN_ACTION`). */
  action: string
  /** Buy button label (default `Buy`). */
  buyLabel?: string
  /**
   * If set, opening the buy flow shows a confirmation popover before
   * `EXECUTE_PLUGIN_ACTION` runs (same behavior as `button.confirmMessage`).
   */
  confirmMessage?: string
  /** Label on the popover confirm button (defaults to `Confirm` in the template). */
  confirmText?: string
  /**
   * Attribute compared against `price` for afford checks (default `coin`).
   */
  balanceAttribute?: GameAttributeName
}

/**
 * Tabular shop listing: icon, item (name + description), price, qty, buy action.
 * Intended for `area: "gameStateTab"` inside a plugin tab.
 */
export interface ShopOfferTableComponentProps {
  rows: ShopOfferTableRow[]
}

/**
 * Type-safe mapping of component names to their props.
 */
export interface TemplateComponentPropsMap {
  username: UsernameComponentProps
  text: TextComponentProps
  "text-block": TextBlockComponentProps
  heading: HeadingComponentProps
  emoji: EmojiComponentProps
  icon: IconComponentProps
  button: ButtonComponentProps
  badge: BadgeComponentProps
  leaderboard: LeaderboardComponentProps
  countdown: CountdownComponentProps
  "game-leaderboard": GameLeaderboardComponentProps
  "game-attribute": GameAttributeComponentProps
  "modifier-badge": ModifierBadgeComponentProps
  "inventory-button": InventoryButtonComponentProps
  "inventory-grid": InventoryGridComponentProps
  "item-badge": ItemBadgeComponentProps
  "shop-offer-table": ShopOfferTableComponentProps
}

// ============================================================================
// Composite Template System
// ============================================================================

/**
 * Text part - renders plain text with variable interpolation.
 */
export interface TemplateTextPart {
  type: "text"
  /** Text content with {{variable}} placeholders */
  content: string
}

/**
 * Component part - renders a frontend component with dynamic props.
 */
export interface TemplateComponentPart {
  type: "component"
  /** Component name - must be a registered template component */
  name: TemplateComponentName
  /** Props passed to component - values can use {{variable}} syntax */
  props: Record<string, string>
}

// ============================================================================
// Plugin Component System
// ============================================================================

/**
 * Metadata that plugins add to template components for placement and behavior.
 */
export interface PluginComponentMetadata {
  /** Unique identifier for this component within the plugin */
  id: string
  /** Where the component should be rendered */
  area: PluginComponentArea
  /**
   * Component is only shown when condition(s) are met.
   * Checks both config and store values.
   * If an array is provided, ALL conditions must be true (AND logic).
   *
   * @example
   * // Simple truthy check on config field
   * showWhen: { field: "enabled", value: true }
   *
   * // Check store value
   * showWhen: { field: "isSkipped", value: true }
   *
   * // Multiple conditions (AND)
   * showWhen: [
   *   { field: "enabled", value: true },
   *   { field: "showCountdown", value: true }
   * ]
   */
  showWhen?: import("./Plugin").ShowWhenCondition | import("./Plugin").ShowWhenCondition[]
}

/**
 * Plugin component definition - combines template component props with placement metadata.
 * This is a discriminated union of all template components + metadata.
 */
export type PluginComponentDefinition =
  | (PluginComponentMetadata & { type: "username" } & UsernameComponentProps)
  | (PluginComponentMetadata & { type: "text" } & TextComponentProps)
  | (PluginComponentMetadata & { type: "text-block" } & TextBlockComponentProps)
  | (PluginComponentMetadata & { type: "heading" } & HeadingComponentProps)
  | (PluginComponentMetadata & { type: "emoji" } & EmojiComponentProps)
  | (PluginComponentMetadata & { type: "icon" } & IconComponentProps)
  | (PluginComponentMetadata & { type: "button" } & ButtonComponentProps)
  | (PluginComponentMetadata & { type: "badge" } & BadgeComponentProps)
  | (PluginComponentMetadata & { type: "leaderboard" } & LeaderboardComponentProps)
  | (PluginComponentMetadata & { type: "countdown" } & CountdownComponentProps)
  | (PluginComponentMetadata & { type: "game-leaderboard" } & GameLeaderboardComponentProps)
  | (PluginComponentMetadata & { type: "game-attribute" } & GameAttributeComponentProps)
  | (PluginComponentMetadata & { type: "modifier-badge" } & ModifierBadgeComponentProps)
  | (PluginComponentMetadata & { type: "inventory-button" } & InventoryButtonComponentProps)
  | (PluginComponentMetadata & { type: "inventory-grid" } & InventoryGridComponentProps)
  | (PluginComponentMetadata & { type: "item-badge" } & ItemBadgeComponentProps)
  | (PluginComponentMetadata & { type: "shop-offer-table" } & ShopOfferTableComponentProps)
  | PluginModalComponent // Modal is special - it contains children
  | PluginTabComponent // Tab is a container for game state modal tabs

/**
 * Type aliases for convenience when working with specific component types.
 */
export type PluginTextComponent = PluginComponentMetadata & { type: "text" } & TextComponentProps
export type PluginTextBlockComponent = PluginComponentMetadata & {
  type: "text-block"
} & TextBlockComponentProps
export type PluginHeadingComponent = PluginComponentMetadata & {
  type: "heading"
} & HeadingComponentProps
export type PluginEmojiComponent = PluginComponentMetadata & { type: "emoji" } & EmojiComponentProps
export type PluginIconComponent = PluginComponentMetadata & { type: "icon" } & IconComponentProps
export type PluginButtonComponent = PluginComponentMetadata & {
  type: "button"
} & ButtonComponentProps
export type PluginBadgeComponent = PluginComponentMetadata & { type: "badge" } & BadgeComponentProps
export type PluginLeaderboardComponent = PluginComponentMetadata & {
  type: "leaderboard"
} & LeaderboardComponentProps
export type PluginUsernameComponent = PluginComponentMetadata & {
  type: "username"
} & UsernameComponentProps
export type PluginCountdownComponent = PluginComponentMetadata & {
  type: "countdown"
} & CountdownComponentProps
export type PluginShopOfferTableComponent = PluginComponentMetadata & {
  type: "shop-offer-table"
} & ShopOfferTableComponentProps

/**
 * Modal component - special container that can hold other components.
 * Requires a button with `opensModal` pointing to this modal's ID.
 */
export interface PluginModalComponent extends PluginComponentMetadata {
  type: "modal"
  title: string
  size?: "sm" | "md" | "lg" | "xl"
  children: PluginComponentDefinition[]
}

/**
 * Tab component - registers a tab in the user's game state modal.
 *
 * Plugins can register tabs to provide additional UI within the game state
 * modal (which always has a built-in "Inventory" tab as the first entry).
 * The tab's `children` are rendered when the tab is selected.
 *
 * Tabs are only valid inside `area: "gameStateTab"`.
 *
 * @example
 * ```typescript
 * {
 *   id: "music-shop-tab",
 *   type: "tab",
 *   area: "gameStateTab",
 *   label: "Shop",
 *   icon: "shopping-cart",
 *   showWhen: { field: "enabled", value: true },
 *   children: [
 *     { id: "shop-stock", type: "text-block", area: "gameStateTab",
 *       content: "{{skipTokenStock}} in stock" },
 *     { id: "buy-skip-token", type: "button", area: "gameStateTab",
 *       label: "Buy ({{config.skipTokenPrice}} coins)", action: "buySkipToken" },
 *   ],
 * }
 * ```
 */
export interface PluginTabComponent extends PluginComponentMetadata {
  type: "tab"
  /** Tab label shown in the tab bar */
  label: string
  /** Optional icon name to display in the tab bar */
  icon?: string
  /** Components rendered when this tab is selected */
  children: PluginComponentDefinition[]
}

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Plugin component schema returned by getComponentSchema().
 * Defines all UI components and their data requirements.
 */
export interface PluginComponentSchema {
  components: PluginComponentDefinition[]
  /**
   * List of keys in the plugin's internal store that should be updated
   * when a plugin event with a matching key in its payload is received.
   */
  storeKeys?: string[]
}

/**
 * Plugin component state - key-value store for component data.
 */
export type PluginComponentState = Record<string, unknown>

/**
 * Combined store for all plugin component states.
 * Structure: { [pluginName]: { [storeKey]: value } }
 */
export type PluginComponentStores = Record<string, PluginComponentState>
