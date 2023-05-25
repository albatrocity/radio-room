import { Box, Button, Icon } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import { motion } from "framer-motion"
import React, { useRef } from "react"
import { FiArrowDown } from "react-icons/fi"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"

import { sortByTimestamp } from "../lib/sortByTimestamp"
import { scrollFollowMachine } from "../machines/scrollFollowMachine"
import { useCurrentUser } from "../state/authStore"
import { useChatStore, useSortedChatMessages } from "../state/chatStore"
import { ChatMessage as Message } from "../types/ChatMessage"
import { User } from "../types/User"
import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"

const MotionButton = motion(Button)

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
      <MotionButton
        position="absolute"
        bottom={2}
        right={2}
        zIndex={2}
        rightIcon={<Icon as={FiArrowDown} boxSize={4} />}
        initial={{ opacity: 0, pointerEvents: "none" }}
        animate={{
          opacity: state.matches("detached") ? 1 : 0,
          pointerEvents: state.matches("detached") ? "auto" : "none",
        }}
        transition={{
          delay: state.matches("detached") ? 1 : 0,
        }}
        onClick={handleBottomClick}
      >
        Scroll to bottom
        {state.context.newMessages > 0 && `(${state.context.newMessages} new)`}
      </MotionButton>
    </Box>
  )
}

export default ChatWindow
