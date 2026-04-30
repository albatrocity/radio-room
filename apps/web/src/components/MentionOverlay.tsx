import { Box, Text } from "@chakra-ui/react"

import type { MentionUser } from "../hooks/useMentionTrigger"

type MentionOverlayProps = {
  users: MentionUser[]
  highlightedIndex: number
  onHighlightIndex: (index: number) => void
  onSelect: (user: MentionUser) => void
  placement?: "above" | "below"
}

/**
 * Suggestion list for @mentions. Renders nothing when users is empty.
 * Parent controls visibility (only mount when mention is active).
 */
const MentionOverlay = ({
  users,
  highlightedIndex,
  onHighlightIndex,
  onSelect,
  placement = "above",
}: MentionOverlayProps) => {
  if (users.length === 0) return null

  const placementCss =
    placement === "above"
      ? { bottom: "100%", mb: 1 }
      : { top: "100%", mt: 1 }

  return (
    <Box
      position="absolute"
      left={0}
      right={0}
      zIndex={1400}
      maxH="200px"
      overflowY="auto"
      borderRadius="md"
      borderWidth={1}
      borderColor="secondaryBorder"
      bg="appBg"
      boxShadow="md"
      py={1}
      {...placementCss}
      role="listbox"
      aria-label="Mention suggestions"
    >
      {users.map((user, index) => (
        <Box
          key={user.id}
          role="option"
          aria-selected={index === highlightedIndex}
          px={2}
          py={1}
          cursor="pointer"
          bg="transparent"
          data-highlighted={index === highlightedIndex || undefined}
          css={{
            "&[data-highlighted]": {
              bg: "actionBgLite",
            },
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(user)
          }}
          onMouseEnter={() => onHighlightIndex(index)}
        >
          <Text fontSize="xs">{user.display}</Text>
        </Box>
      ))}
    </Box>
  )
}

export default MentionOverlay
