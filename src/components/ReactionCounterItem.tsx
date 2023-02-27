import React, { memo } from "react"
import { Button, HStack, Text, Tooltip, ButtonProps } from "@chakra-ui/react"
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
} & ButtonProps

const ReactionCounterItem = ({
  count,
  users,
  emoji,
  onReactionClick,
  currentUserId,
  darkBg = false,
  ...buttonProps
}: ReactionCounterItemProps) => {
  if (emoji === "undefined") {
    return null
  }

  const isCurrentUserActive = users.includes(currentUserId)

  return (
    <Tooltip
      hasArrow
      placement="top"
      label={
        <HStack>
          <em-emoji size="24px" shortcodes={emoji} />
          <ListUsernames ids={users} />
        </HStack>
      }
    >
      <Button
        aria-label={`${emoji} reactions`}
        onClick={() => onReactionClick({ shortcodes: emoji })}
        size="sm"
        py={0.5}
        px={1}
        borderWidth={1}
        variant={"reaction"}
        data-active={isCurrentUserActive}
        data-dark-bg={darkBg}
        {...buttonProps}
      >
        <HStack spacing={1}>
          <em-emoji shortcodes={emoji}></em-emoji>
          {count > 1 && <Text fontSize="xs">{count}</Text>}
        </HStack>
      </Button>
    </Tooltip>
  )
}

export default memo(ReactionCounterItem)
