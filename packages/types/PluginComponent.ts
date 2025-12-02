/**
 * Plugin Component System Types
 *
 * Allows plugins to define declarative UI components that the frontend
 * can interpret and render without plugin-specific React code.
 *
 * Architecture:
 * - Template components define the actual rendering (username, text, emoji, etc.)
 * - Plugin components are template components + placement metadata (area, enabledWhen)
 * - Frontends implement template components; plugins reference them by name
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
// Template Component System
// ============================================================================

/**
 * Built-in template component names that all frontends must implement.
 * These can be referenced in composite templates and plugin components.
 */
export type TemplateComponentName =
  | "username"
  | "text"
  | "emoji"
  | "icon"
  | "button"
  | "leaderboard"
  | "countdown"

/**
 * Props for the username template component.
 */
export interface UsernameComponentProps {
  userId: string
}

/**
 * Props for the text template component.
 */
export interface TextComponentProps {
  content: string
  variant?: "default" | "muted" | "bold" | "small"
}

/**
 * Props for the emoji template component.
 */
export interface EmojiComponentProps {
  emoji: string
  size?: "sm" | "md" | "lg"
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
 */
export interface ButtonComponentProps {
  label: string
  icon?: string
  opensModal?: string
  variant?: "solid" | "ghost" | "outline" | "link"
  size?: "sm" | "md" | "lg"
}

/**
 * Leaderboard entry format.
 */
export interface LeaderboardEntry {
  value: string
  score: number
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
 * Type-safe mapping of component names to their props.
 */
export interface TemplateComponentPropsMap {
  username: UsernameComponentProps
  text: TextComponentProps
  emoji: EmojiComponentProps
  icon: IconComponentProps
  button: ButtonComponentProps
  leaderboard: LeaderboardComponentProps
  countdown: CountdownComponentProps
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

/**
 * Plugin component definition - combines template component props with placement metadata.
 * This is a discriminated union of all template components + metadata.
 */
export type PluginComponentDefinition =
  | (PluginComponentMetadata & { type: "username" } & UsernameComponentProps)
  | (PluginComponentMetadata & { type: "text" } & TextComponentProps)
  | (PluginComponentMetadata & { type: "emoji" } & EmojiComponentProps)
  | (PluginComponentMetadata & { type: "icon" } & IconComponentProps)
  | (PluginComponentMetadata & { type: "button" } & ButtonComponentProps)
  | (PluginComponentMetadata & { type: "leaderboard" } & LeaderboardComponentProps)
  | (PluginComponentMetadata & { type: "countdown" } & CountdownComponentProps)
  | PluginModalComponent // Modal is special - it contains children

/**
 * Type aliases for convenience when working with specific component types.
 */
export type PluginTextComponent = PluginComponentMetadata & { type: "text" } & TextComponentProps
export type PluginEmojiComponent = PluginComponentMetadata & { type: "emoji" } & EmojiComponentProps
export type PluginIconComponent = PluginComponentMetadata & { type: "icon" } & IconComponentProps
export type PluginButtonComponent = PluginComponentMetadata & { type: "button" } & ButtonComponentProps
export type PluginLeaderboardComponent = PluginComponentMetadata & { type: "leaderboard" } & LeaderboardComponentProps
export type PluginUsernameComponent = PluginComponentMetadata & { type: "username" } & UsernameComponentProps
export type PluginCountdownComponent = PluginComponentMetadata & { type: "countdown" } & CountdownComponentProps

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
