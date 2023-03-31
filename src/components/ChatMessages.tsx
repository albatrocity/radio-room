import React, { memo, useEffect, useState } from "react"
import { Box, Button, Icon } from "@chakra-ui/react"
import { FiArrowDown } from "react-icons/fi"
import { get, sortBy, isEqual } from "lodash/fp"
import ScrollToBottom, {
  useScrollTo,
  useScrollToBottom,
  useSticky,
} from "react-scroll-to-bottom"
import styled from "@emotion/styled"

import ChatMessage from "./ChatMessage"
import { ChatMessage as ChatMessageType } from "../types/ChatMessage"
import SystemMessage from "./SystemMessage"

const StyledScrollToBottom = styled(ScrollToBottom)`
  height: 100%;
  overflow: auto;

  .default-scroll-button {
    display: none;
  }
`

interface ScrollInnerProps {
  messages: ChatMessageType[]
  currentUserId: string
}

const ScrollInner = ({ messages, currentUserId }: ScrollInnerProps) => {
  const scrollToBottom = useScrollToBottom()
  const scrollTo = useScrollTo()
  const [sticky] = useSticky()
  const [lastMessage, setLastMessage] = useState<ChatMessageType | null>(null)

  useEffect(() => {
    if (sticky && lastMessage) {
      setLastMessage(null)
    }
    if (!sticky && !lastMessage) {
      setLastMessage(messages[messages.length - 1])
    }
    if (messages.length === 60 && sticky) {
      scrollTo("100%")
    }
  }, [sticky, messages])

  const lastMessageIndex = lastMessage ? messages.indexOf(lastMessage) : -1
  const messagesSinceLast = messages.length - 1 - lastMessageIndex

  return (
    <Box>
      {messages.map((x, i) => {
        const sameUserAsLastMessage = isEqual(
          get("user.userId", x),
          get("user.userId", messages[i - 1]),
        )
        const sameUserAsNextMessage = isEqual(
          get("user.userId", x),
          get("user.userId", messages[i + 1]),
        )
        return get("user.id", x) === "system" ? (
          <SystemMessage key={x.timestamp} {...x} />
        ) : (
          <ChatMessage
            key={x.timestamp}
            {...x}
            currentUserId={currentUserId}
            showUsername={!sameUserAsLastMessage}
            anotherUserMessage={sameUserAsNextMessage}
          />
        )
      })}
      {!sticky && (
        <Box style={{ position: "absolute", right: "10px", bottom: "1em" }}>
          <Button
            onClick={() => scrollToBottom("smooth")}
            rightIcon={<Icon as={FiArrowDown} boxSize={4} />}
          >
            Scroll to bottom
            {messagesSinceLast > 0 ? ` (${messagesSinceLast} new)` : ""}
          </Button>
        </Box>
      )}
    </Box>
  )
}

const ChatMessages = ({
  messages,
  ...rest
}: {
  messages: ChatMessageType[]
} & ScrollInnerProps) => {
  const sortedMessages = sortBy("timestamp", messages)

  return (
    <StyledScrollToBottom
      followButtonClassName="default-scroll-button"
      initialScrollBehavior="auto"
    >
      <ScrollInner messages={sortedMessages} {...rest} />
    </StyledScrollToBottom>
  )
}

export default memo(ChatMessages)
