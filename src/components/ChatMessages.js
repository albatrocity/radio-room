import React, { memo } from "react"
import { sortBy, reverse } from "lodash/fp"
import { Box } from "grommet"
import { get } from "lodash/fp"

import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"

const ChatMessages = ({
  messages,
  currentUserId,
  onOpenReactionPicker,
  onReactionClick,
}) => {
  const sortedMessages = reverse(sortBy("timestamp", messages))

  return (
    <Box
      flex={{ grow: 1, shrink: 1 }}
      height="1px"
      overflow="auto"
      className="chatMessages"
    >
      <div className="chatMessages-overflow" style={{ height: "100%" }}>
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
            />
          )
        )}
      </div>
    </Box>
  )
}

export default memo(ChatMessages)
