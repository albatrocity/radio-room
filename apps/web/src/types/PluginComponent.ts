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
  TextBlockComponentProps,
  HeadingComponentProps,
  EmojiComponentProps,
  IconComponentProps,
  ButtonComponentProps,
  BadgeComponentProps,
  LeaderboardComponentProps,
  CountdownComponentProps,
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
  PluginTextBlockComponent,
  PluginHeadingComponent,
  PluginEmojiComponent,
  PluginIconComponent,
  PluginButtonComponent,
  PluginBadgeComponent,
  PluginLeaderboardComponent,
  PluginUsernameComponent,
  PluginCountdownComponent,
  PluginModalComponent,
  
  // Schema
  PluginComponentSchema,
  PluginComponentState,
  PluginComponentStores,
} from "@repo/types"
