import React, { memo, useEffect, useState } from "react"
import { Box, Button } from "grommet"
import { LinkBottom } from "grommet-icons"
import { get, find, sortBy, reverse, isEqual } from "lodash/fp"
import styled from "styled-components"
import ScrollToBottom, {
  useScrollToBottom,
  useSticky,
} from "react-scroll-to-bottom"

import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"

const Container = styled(Box)`
  height: 100%;
  .scroll-to-bottom {
    height: 100%;
    position: relative;
    .default-scroll-button {
      display: none;
    }
  }
  .scroll-view {
    height: 100%;
    overflow-y: auto;
    width: 100%;
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

  const lastMessageIndex = lastMessage
    ? messages.indexOf(find({ timestamp: lastMessage.timestamp }, messages))
    : -1
  const messagesSinceLast = messages.length - 1 - lastMessageIndex

  return (
    <>
      {messages.map((x, i) => {
        console.log(x)
        const sameUserAsLastMessage = isEqual(
          get("user.userId", x),
          get("user.userId", messages[i - 1])
        )
        const sameUserAsNextMessage = isEqual(
          get("user.userId", x),
          get("user.userId", messages[i + 1])
        )
        return get("user.id", x) === "system" ? (
          <SystemMessage key={x.timestamp} {...x} />
        ) : (
          <ChatMessage
            key={x.timestamp}
            {...x}
            currentUserId={currentUserId}
            onOpenReactionPicker={onOpenReactionPicker}
            onReactionClick={onReactionClick}
            showUsername={!sameUserAsLastMessage}
            anotherUserMessage={sameUserAsNextMessage}
          />
        )
      })}
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
    <Container>
      <ScrollToBottom
        followButtonClassName="default-scroll-button"
        scrollViewClassName="scroll-view"
        className="scroll-to-bottom"
      >
        <ScrollInner messages={sortedMessages} {...rest} />
      </ScrollToBottom>
    </Container>
  )
}

export default memo(ChatMessages)
