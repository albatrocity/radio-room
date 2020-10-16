import React, { memo } from "react"
import { sortBy, reverse } from "lodash/fp"
import { Box } from "grommet"
import { get } from "lodash/fp"

import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"
import TypingIndicator from "./TypingIndicator"
import { useChatReactions } from "../contexts/useChatReactions"

const ChatMessages = ({
  messages,
  currentUserId,
  typing,
  onOpenReactionPicker,
  onReactionClick,
}) => {
  const sortedMessages = reverse(sortBy("timestamp", messages))
  const { state } = useChatReactions()

  return (
    <Box
      flex={{ grow: 1, shrink: 1 }}
      height="1px"
      overflow="auto"
      className="chatMessages"
    >
      <div className="chatMessages-overflow" style={{ height: "100%" }}>
        <TypingIndicator typing={typing} currentUserId={currentUserId} />
        {sortedMessages.map(x =>
          get("user.id", x) === "system" ? (
            <SystemMessage key={x.timestamp} {...x} />
          ) : (
            <ChatMessage
              key={x.timestamp}
              {...x}
              currentUserId={currentUserId}
              onOpenReactionPicker={onOpenReactionPicker}
              onReactionClick={onReactionClick}
              reactions={state.reactions[x.timestamp]}
            />
          )
        )}
      </div>
    </Box>
  )
}

export default memo(ChatMessages)
