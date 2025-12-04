import { Box, Button, Icon } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import React, { useRef } from "react"
import { FiArrowDown } from "react-icons/fi"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"

import { scrollFollowMachine } from "../machines/scrollFollowMachine"
import { useCurrentUser } from "../state/authStore"
import { useSortedChatMessages } from "../state/chatStore"
import { ChatMessage as Message } from "../types/ChatMessage"
import { User } from "../types/User"
import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"

const InnerItem = React.memo(
  ({
    message,
    sameUserAsLastMessage,
    sameUserAsNextMessage,
    currentUserId,
  }: {
    index: number
    message: Message
    sameUserAsLastMessage: boolean
    sameUserAsNextMessage: boolean
    currentUserId: User["userId"]
  }) =>
    message.user.userId === "system" ? (
      <SystemMessage key={message.timestamp} {...message} />
    ) : (
      <ChatMessage
        key={message.timestamp}
        {...message}
        currentUserId={currentUserId}
        showUsername={!sameUserAsLastMessage}
        anotherUserMessage={sameUserAsNextMessage}
      />
    ),
)

function ChatWindow() {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [state, send] = useMachine(scrollFollowMachine)
  const messages = useSortedChatMessages()
  const currentUser = useCurrentUser()
  const handleBottomClick = () => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: "smooth",
      align: "end",
    })
  }

  const renderComponent = (index: number) => {
    const message = messages[index]
    const sameUserAsLastMessage =
      message.user.userId === messages[index - 1]?.user.userId
    const sameUserAsNextMessage =
      message.user.userId === messages[index + 1]?.user.userId

    return (
      <InnerItem
        index={index}
        currentUserId={currentUser.userId}
        message={message}
        sameUserAsLastMessage={sameUserAsLastMessage}
        sameUserAsNextMessage={sameUserAsNextMessage}
      />
    )
  }

  const isDetached = state.matches("detached")

  return (
    <Box position="relative" height="100%">
      <Virtuoso
        style={{ height: "100%" }}
        totalCount={messages.length}
        itemContent={renderComponent}
        ref={virtuosoRef}
        followOutput={"smooth"}
        atBottomStateChange={(atBottom) => send(atBottom ? "ATTACH" : "DETACH")}
        alignToBottom
        initialTopMostItemIndex={messages.length - 1}
      />
      <Button
        position="absolute"
        bottom={2}
        right={2}
        zIndex={2}
        opacity={isDetached ? 1 : 0}
        pointerEvents={isDetached ? "auto" : "none"}
        transition="opacity 0.2s"
        transitionDelay={isDetached ? "1s" : "0s"}
        onClick={handleBottomClick}
      >
        Scroll to bottom
        {state.context.newMessages > 0 && `(${state.context.newMessages} new)`}
        <Icon as={FiArrowDown} boxSize={4} ml={2} />
      </Button>
    </Box>
  )
}

export default ChatWindow
