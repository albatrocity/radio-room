import React, { memo } from "react"
import { Button, HStack, Text, Tooltip } from "@chakra-ui/react"
import { EmojiData } from "emoji-mart"

import ListUsernames from "./ListUsernames"
import { User } from "../types/User"

interface ReactionCounterItemProps {
  count: number
  users: User["userId"][]
  emoji: string
  onReactionClick: (emoji: EmojiData) => void
  currentUserId: string
  color?: string
}

const ReactionCounterItem = ({
  count,
  users,
  emoji,
  onReactionClick,
  color,
}: ReactionCounterItemProps) => {
  if (emoji === "undefined") {
    return null
  }

  return (
    <Tooltip hasArrow placement="top" label={<ListUsernames ids={users} />}>
      <Button
        aria-label={`${emoji} reactions`}
        onClick={() => onReactionClick({ shortcodes: emoji })}
        size="small"
        py={0.5}
        px={1}
        background={color}
      >
        <HStack spacing={1}>
          {count > 1 && <Text fontSize="xs">{count}</Text>}
          <em-emoji shortcodes={emoji}></em-emoji>
        </HStack>
      </Button>
    </Tooltip>
  )
}

export default memo(ReactionCounterItem)
