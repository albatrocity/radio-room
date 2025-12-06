import { Text } from "@chakra-ui/react"
import { interpolateTemplate } from "@repo/utils"
import { usePluginComponentContext } from "../context"
import { CompositeTemplateRenderer } from "./CompositeTemplateRenderer"
import type { TextComponentProps } from "../../../types/PluginComponent"

/**
 * Text component - renders text with optional styling.
 */
export function TextTemplateComponent({ content, variant = "default", size }: TextComponentProps) {
  const { store, config, textColor } = usePluginComponentContext()

  const fontWeight = variant === "bold" ? "bold" : "normal"
  // Use explicit size if provided, otherwise derive from variant
  const fontSize = size ?? (variant === "small" ? "xs" : "sm")
  // Use variant-specific color, or fall back to area textColor
  const color = variant === "muted" ? "secondary.subtle" : textColor

  // Handle string content
  if (typeof content === "string") {
    const interpolatedContent = interpolateTemplate(content, { ...store, config })
    return (
      <Text as="span" fontSize={fontSize} fontWeight={fontWeight} color={color}>
        {interpolatedContent}
      </Text>
    )
  }

  // CompositeTemplate content
  return (
    <Text as="span" fontSize={fontSize} fontWeight={fontWeight} color={color}>
      <CompositeTemplateRenderer template={content} values={{ ...store, config }} />
    </Text>
  )
}
