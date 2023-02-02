import React, { memo } from "react"
import { IconButton, Box, Text, Tooltip } from "@chakra-ui/react"
import { EmojiData } from "emoji-mart"

import ListUsernames from "./ListUsernames"
import { User } from "../types/User"

interface ReactionCounterItemProps {
  count: number
  users: User["userId"][]
  emoji: string
  onReactionClick: (emoji: EmojiData) => void
  currentUserId: string
  color: string
}

const ReactionCounterItem = ({
  count,
  users,
  emoji,
  onReactionClick,
  currentUserId,
  color = "light-2",
}: ReactionCounterItemProps) => {
  if (emoji === "undefined") {
    return null
  }

  return (
    <Tooltip hasArrow placement="top" label={<ListUsernames ids={users} />}>
      <IconButton
        aria-label={`${emoji} reactions`}
        color={color}
        gap="small"
        onClick={() => onReactionClick({ short_names: emoji })}
        size="small"
        style={{ padding: "0.1rem 0.2rem" }}
        icon={
          <Box height={"12px"}>
            <em-emoji shortnames={emoji} fallback={emoji} />
          </Box>
        }
      >
        <Text fontSize="sm" as="b" sx={{ lineHeight: "auto" }}>
          {count}
        </Text>
      </IconButton>
    </Tooltip>
  )
}

export default memo(ReactionCounterItem)
