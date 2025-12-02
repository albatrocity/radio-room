import { Text } from "@chakra-ui/react"
import { interpolateTemplate } from "@repo/utils"
import { usePluginComponentContext } from "../context"
import { CompositeTemplateRenderer } from "./CompositeTemplateRenderer"
import type { TextComponentProps } from "../../../types/PluginComponent"

/**
 * Text component - renders text with optional styling.
 */
export function TextTemplateComponent({ content, variant = "default" }: TextComponentProps) {
  const { store, config } = usePluginComponentContext()

  const fontWeight = variant === "bold" ? "bold" : "normal"
  const fontSize = variant === "small" ? "xs" : "sm"
  const color = variant === "muted" ? "gray.500" : undefined

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

