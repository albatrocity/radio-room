import React, { memo, useEffect, useState } from "react"
import { Box, Button, Icon } from "@chakra-ui/react"
import { GrLinkBottom } from "react-icons/gr"
import { get, sortBy, isEqual } from "lodash/fp"
import styled from "styled-components"
import ScrollToBottom, {
  useScrollToBottom,
  useSticky,
} from "react-scroll-to-bottom"

import ChatMessage from "./ChatMessage"
import { ChatMessage as ChatMessageType } from "../types/ChatMessage"
import SystemMessage from "./SystemMessage"
import { EmojiData } from "emoji-mart"

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

interface ScrollInnerProps {
  messages: ChatMessageType[]
  currentUserId: string
  onOpenReactionPicker: () => void
  onReactionClick: (emoji: EmojiData) => void
}

const ScrollInner = ({
  messages,
  currentUserId,
  onOpenReactionPicker,
  onReactionClick,
}: ScrollInnerProps) => {
  const scrollToBottom = useScrollToBottom()
  const [sticky] = useSticky()
  const [lastMessage, setLastMessage] = useState<ChatMessageType | null>(null)

  useEffect(() => {
    if (sticky && lastMessage) {
      setLastMessage(null)
    }
    if (!sticky && !lastMessage) {
      setLastMessage(messages[messages.length - 1])
    }
  }, [sticky, messages])

  const lastMessageIndex = lastMessage ? messages.indexOf(lastMessage) : -1
  const messagesSinceLast = messages.length - 1 - lastMessageIndex

  return (
    <>
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
            onOpenReactionPicker={onOpenReactionPicker}
            onReactionClick={onReactionClick}
            showUsername={!sameUserAsLastMessage}
            anotherUserMessage={sameUserAsNextMessage}
          />
        )
      })}
      {!sticky && (
        <Box style={{ position: "absolute", right: 0, bottom: "1em" }}>
          <Button
            onClick={() => scrollToBottom()}
            rightIcon={<Icon as={GrLinkBottom} boxSize={4} />}
          >
            Scroll to bottom
            {messagesSinceLast > 0 ? ` (${messagesSinceLast} new)` : ""}
          </Button>
        </Box>
      )}
    </>
  )
}

const ChatMessages = ({
  messages,
  ...rest
}: {
  messages: ChatMessageType[]
} & ScrollInnerProps) => {
  const sortedMessages = sortBy("timestamp", messages)
  console.log(messages)

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
