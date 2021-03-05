import React, { memo, useEffect, useState } from "react"
import { sortBy, reverse } from "lodash/fp"
import { Box, Button } from "grommet"
import { LinkBottom } from "grommet-icons"
import { get } from "lodash/fp"
import styled from "styled-components"
import ScrollToBottom, {
  useScrollToBottom,
  useSticky,
} from "react-scroll-to-bottom"

import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"

const StyledScrollToBottom = styled(ScrollToBottom)`
  height: 100%;
  @media only screen and (max-width: 480px) {
    height: calc(100vh - 330px);
  }
  .default-scroll-button {
    display: none;
  }
`

const ScrollInner = ({
  messages,
  currentUserId,
  onOpenReactionPicker,
  onReactionClick,
}) => {
  const scrollToBottom = useScrollToBottom()
  const [sticky] = useSticky()
  const [lastMessage, setLastMessage] = useState(null)

  useEffect(() => {
    if (sticky && lastMessage) {
      setLastMessage(null)
    }
    if (!sticky && !lastMessage) {
      setLastMessage(messages[messages.length - 1])
    }
  }, [sticky, messages])

  const lastMessageIndex = messages.indexOf(lastMessage)
  const messagesSinceLast = messages.length - 1 - lastMessageIndex

  return (
    <>
      {messages.map(x =>
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
      {!sticky && (
        <Box
          elevation="large"
          style={{ position: "absolute", right: 0, bottom: "1em" }}
          round="small"
        >
          <Button
            elevation="large"
            onClick={scrollToBottom}
            primary
            icon={<LinkBottom size="small" />}
            label={`Scroll to bottom ${
              messagesSinceLast > 0 ? `(${messagesSinceLast} new)` : ""
            }`}
          ></Button>
        </Box>
      )}
    </>
  )
}

const ChatMessages = ({ messages, ...rest }) => {
  const sortedMessages = sortBy("timestamp", messages)

  return (
    <StyledScrollToBottom followButtonClassName="default-scroll-button">
      <ScrollInner messages={sortedMessages} {...rest} />
    </StyledScrollToBottom>
  )
}

export default memo(ChatMessages)
