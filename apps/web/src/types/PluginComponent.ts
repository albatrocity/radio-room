/**
 * Frontend types for plugin components.
 * Re-exports types from @repo/types.
 */

// Re-export all template component types
export type {
  // Areas
  PluginComponentArea,
  
  // Template component names and props
  TemplateComponentName,
  UsernameComponentProps,
  TextComponentProps,
  EmojiComponentProps,
  IconComponentProps,
  ButtonComponentProps,
  LeaderboardComponentProps,
  LeaderboardEntry,
  TemplateComponentPropsMap,
  
  // Template composition
  TemplateTextPart,
  TemplateComponentPart,
  CompositeTemplate,
  
  // Plugin components
  PluginComponentMetadata,
  PluginComponentDefinition,
  PluginTextComponent,
  PluginEmojiComponent,
  PluginIconComponent,
  PluginButtonComponent,
  PluginLeaderboardComponent,
  PluginUsernameComponent,
  PluginModalComponent,
  
  // Schema
  PluginComponentSchema,
  PluginComponentState,
  PluginComponentStores,
} from "@repo/types"
