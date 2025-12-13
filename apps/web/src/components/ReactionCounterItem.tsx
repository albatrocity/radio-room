import { memo } from "react"
import { Button, HStack, Text, Tooltip, ButtonProps } from "@chakra-ui/react"

type AppColorPalette = "primary" | "secondary" | "action"
import { EmojiData } from "emoji-mart"

import ListUsernames from "./ListUsernames"
import { User } from "../types/User"

type ReactionCounterItemProps = {
  count: number
  users: User["userId"][]
  emoji: string
  onReactionClick: (emoji: EmojiData) => void
  currentUserId: string
  darkBg?: boolean
  buttonColorScheme: AppColorPalette
} & ButtonProps

const ReactionCounterItem = ({
  count,
  users,
  emoji,
  onReactionClick,
  currentUserId,
  darkBg = false,
  variant = "reaction",
  buttonColorScheme = "action",
  ...buttonProps
}: ReactionCounterItemProps) => {
  if (emoji === "undefined") {
    return null
  }

  const isCurrentUserActive = users.includes(currentUserId)

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button
          aria-label={`${emoji} reactions`}
          onClick={() => onReactionClick({ shortcodes: emoji })}
          size="sm"
          py={0.5}
          px={1}
          borderWidth={1}
          variant={variant}
          colorPalette={buttonColorScheme}
          data-active={isCurrentUserActive}
          data-dark-bg={darkBg}
          {...buttonProps}
        >
          <HStack gap={1}>
            <em-emoji shortcodes={emoji}></em-emoji>
            {count > 1 && <Text fontSize="xs">{count}</Text>}
          </HStack>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content>
          <Tooltip.Arrow />
          <HStack>
            <em-emoji size="32px" shortcodes={emoji} />
            <ListUsernames ids={users} />
          </HStack>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}

export default memo(ReactionCounterItem)
