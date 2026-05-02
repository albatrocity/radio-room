import React from "react"
import { Text } from "@chakra-ui/react"
import type { TemplateComponentName, TemplateComponentPropsMap } from "../../../types/PluginComponent"

// Import all template components
import { UsernameTemplateComponent } from "./UsernameComponent"
import { TextTemplateComponent } from "./TextComponent"
import { TextBlockTemplateComponent } from "./TextBlockComponent"
import { HeadingTemplateComponent } from "./HeadingComponent"
import { EmojiTemplateComponent } from "./EmojiComponent"
import { IconTemplateComponent } from "./IconComponent"
import { ButtonTemplateComponent } from "./ButtonComponent"
import { BadgeTemplateComponent } from "./BadgeComponent"
import { LeaderboardTemplateComponent } from "./LeaderboardComponent"
import { CountdownTemplateComponent } from "./CountdownComponent"
import { GameAttributeTemplateComponent } from "./GameAttributeComponent"
import { ShopOfferTableTemplateComponent } from "./ShopOfferTableComponent"

/**
 * Strongly-typed map of built-in template component names to React components.
 * All frontends must implement these components for composite templates to work.
 *
 * Note: this map is partial - some declared component types (e.g.
 * `game-leaderboard`, `inventory-grid`, `modifier-badge`) are reserved in
 * the type system but not yet implemented client-side. Plugins that
 * register them today will hit the "Unknown component" warning in
 * `renderTemplateComponent`.
 */
export const TEMPLATE_COMPONENT_MAP: {
  [K in TemplateComponentName]?: React.ComponentType<TemplateComponentPropsMap[K]>
} = {
  username: UsernameTemplateComponent,
  text: TextTemplateComponent,
  "text-block": TextBlockTemplateComponent,
  heading: HeadingTemplateComponent,
  emoji: EmojiTemplateComponent,
  icon: IconTemplateComponent,
  button: ButtonTemplateComponent,
  badge: BadgeTemplateComponent,
  leaderboard: LeaderboardTemplateComponent,
  countdown: CountdownTemplateComponent,
  "game-attribute": GameAttributeTemplateComponent,
  "shop-offer-table": ShopOfferTableTemplateComponent,
}

/**
 * Renders a single template component part with type-safe props.
 */
export function renderTemplateComponent(
  name: TemplateComponentName,
  props: Record<string, string>,
  key: string,
) {
  const Component = TEMPLATE_COMPONENT_MAP[name] as React.ComponentType<any>
  if (!Component) {
    console.warn(`[CompositeTemplate] Unknown component: ${name}`)
    return (
      <Text as="span" key={key}>
        [Unknown: {name}]
      </Text>
    )
  }
  return <Component key={key} {...props} />
}

