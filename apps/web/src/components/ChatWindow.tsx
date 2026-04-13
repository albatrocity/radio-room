import { Box, Button, Icon, ScrollArea } from "@chakra-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMachine, useSelector } from "@xstate/react"
import React, { useEffect } from "react"
import { LuArrowDown } from "react-icons/lu"
import { useStickToBottom } from "use-stick-to-bottom"

import { chatScrollTargetActor } from "../actors/chatScrollTargetActor"
import { scrollFollowMachine } from "../machines/scrollFollowMachine"
import { useCurrentUser, useSortedChatMessages } from "../hooks/useActors"
import { ChatMessage as Message } from "../types/ChatMessage"
import { User } from "../types/User"
import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"
import ScrollShadowViewport from "./ScrollShadowViewport"

const InnerItem = React.memo(
  ({
    message,
    sameUserAsLastMessage,
    sameUserAsNextMessage,
    currentUserId,
  }: {
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
  const [state, send] = useMachine(scrollFollowMachine)
  const messages = useSortedChatMessages()
  const currentUser = useCurrentUser()
  const scrollTargetTimestamp = useSelector(
    chatScrollTargetActor,
    (s) => s.context.targetTimestamp,
  )
  const scrollRequestId = useSelector(chatScrollTargetActor, (s) => s.context.requestId)

  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({
    resize: "smooth",
    initial: "instant",
  })

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 50,
    getItemKey: (index) => messages[index]?.timestamp ?? index,
  })

  useEffect(() => {
    send({ type: isAtBottom ? "ATTACH" : "DETACH" })
  }, [isAtBottom, send])

  useEffect(() => {
    if (!scrollTargetTimestamp || messages.length === 0) {
      return
    }
    const index = messages.findIndex((m) => m.timestamp === scrollTargetTimestamp)
    if (index === -1) {
      console.warn(
        "[ChatWindow] Bookmarked message not found in current chat history:",
        scrollTargetTimestamp,
      )
      chatScrollTargetActor.send({ type: "CLEAR_TARGET" })
      return
    }
    virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" })
    chatScrollTargetActor.send({ type: "CLEAR_TARGET" })
  }, [scrollTargetTimestamp, scrollRequestId, messages, virtualizer])

  const handleBottomClick = () => {
    void scrollToBottom({ animation: "smooth", duration: 100 })
  }

  const virtualItems = virtualizer.getVirtualItems()

  const showJumpToBottom = !isAtBottom

  return (
    <Box position="relative" height="100%">
      <ScrollArea.Root height="100%" size="sm" variant="hover">
        <ScrollShadowViewport ref={scrollRef} height="100%">
          <ScrollArea.Content>
            <Box
              ref={contentRef}
              position="relative"
              width="100%"
              height={`${virtualizer.getTotalSize()}px`}
            >
              {virtualItems.map((virtualRow) => {
                const message = messages[virtualRow.index]
                if (!message) return null
                const sameUserAsLastMessage =
                  message.user.userId === messages[virtualRow.index - 1]?.user.userId
                const sameUserAsNextMessage =
                  message.user.userId === messages[virtualRow.index + 1]?.user.userId

                return (
                  <Box
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    position="absolute"
                    top={0}
                    left={0}
                    width="100%"
                    transform={`translateY(${virtualRow.start}px)`}
                  >
                    <InnerItem
                      currentUserId={currentUser?.userId ?? ""}
                      message={message}
                      sameUserAsLastMessage={sameUserAsLastMessage}
                      sameUserAsNextMessage={sameUserAsNextMessage}
                    />
                  </Box>
                )
              })}
            </Box>
          </ScrollArea.Content>
        </ScrollShadowViewport>
        <ScrollArea.Scrollbar>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
      <Button
        position="absolute"
        bottom={2}
        right={2}
        zIndex={2}
        opacity={showJumpToBottom ? 1 : 0}
        pointerEvents={showJumpToBottom ? "auto" : "none"}
        transition="opacity 0.2s"
        transitionDelay={showJumpToBottom ? "1s" : "0s"}
        onClick={handleBottomClick}
      >
        {state.context.newMessages > 0 && `${state.context.newMessages} new`}
        <Icon as={LuArrowDown} boxSize={4} />
      </Button>
    </Box>
  )
}

export default ChatWindow
