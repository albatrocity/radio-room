import { Box } from "@chakra-ui/react"
import type { EmojiComponentProps } from "../../../types/PluginComponent"

/**
 * Emoji component - renders an emoji with optional size.
 */
export function EmojiTemplateComponent({ emoji, size = "md" }: EmojiComponentProps) {
  const sizeMap = { sm: "16px", md: "24px", lg: "32px" }
  const fontSize = sizeMap[size]

  return (
    <Box as="span" fontSize={fontSize}>
      {/* @ts-ignore - em-emoji is a custom element from emoji-mart */}
      <em-emoji shortcodes={`:${emoji}:`} />
    </Box>
  )
}

