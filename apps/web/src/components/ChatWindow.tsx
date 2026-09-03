import { Box, Button, Icon, ScrollArea } from "@chakra-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMachine, useSelector } from "@xstate/react"
import React, { useCallback, useEffect, useLayoutEffect, useMemo } from "react"
import { LuArrowDown } from "react-icons/lu"
import { useStickToBottom } from "use-stick-to-bottom"

import { chatScrollTargetActor } from "../actors/chatScrollTargetActor"
import { scrollFollowMachine } from "../machines/scrollFollowMachine"
import { useCurrentUser, useListeners, useSortedChatMessages } from "../hooks/useActors"
import { ChatMessage as Message } from "../types/ChatMessage"
import { User } from "../types/User"
import ChatMessage from "./ChatMessage"
import SystemMessage from "./SystemMessage"
import ScrollShadowViewport from "./ScrollShadowViewport"
import VirtualizerContent, { virtualizerViewportCss } from "./VirtualizerContent"
import { chatDisplayUser } from "../lib/chatDisplayUser"
import { ensureEmojiMart } from "../lib/ensureEmojiMart"
import { virtualizerOverscan } from "../lib/virtualizerOverscan"

/** Match consecutive chat bubbles only when actor + presented identity match (ADR 0150). */
function sameChatAttribution(
  a: Message["user"] | undefined,
  b: Message["user"] | undefined,
): boolean {
  if (!a || !b) return false
  return a.userId === b.userId && (a.username ?? "") === (b.username ?? "")
}

/** Match `use-stick-to-bottom`'s STICK_TO_BOTTOM_OFFSET_PX. */
const NEAR_BOTTOM_PX = 70

const InnerItem = React.memo(
  ({
    message,
    displayUser,
    sameUserAsLastMessage,
    sameUserAsNextMessage,
    currentUserId,
    expiresAt,
    createdAt,
  }: {
    message: Message
    displayUser: User
    sameUserAsLastMessage: boolean
    sameUserAsNextMessage: boolean
    currentUserId: User["userId"]
    expiresAt?: number
    createdAt?: number
  }) =>
    message.user.userId === "system" ? (
      <SystemMessage key={message.timestamp} {...message} />
    ) : (
      <ChatMessage
        key={message.timestamp}
        {...message}
        user={displayUser}
        currentUserId={currentUserId}
        showUsername={!sameUserAsLastMessage}
        anotherUserMessage={sameUserAsNextMessage}
        expiresAt={expiresAt}
        createdAt={createdAt}
      />
    ),
)

function ChatWindow() {
  const [state, send] = useMachine(scrollFollowMachine)
  const messages = useSortedChatMessages()
  const listeners = useListeners()
  const currentUser = useCurrentUser()
  const scrollTargetTimestamp = useSelector(chatScrollTargetActor, (s) => s.context.targetTimestamp)
  const scrollRequestId = useSelector(chatScrollTargetActor, (s) => s.context.requestId)

  if (!currentUser) {
    throw new Error("Current user not found")
  }

  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({
    resize: { damping: 0.72, stiffness: 0.1, mass: 1 },
    initial: "instant",
  })

  const getItemKey = useCallback(
    (index: number) => messages[index]?.timestamp ?? index,
    [messages],
  )

  const listenersById = useMemo(
    () => new Map(listeners.map((listener) => [listener.userId, listener])),
    [listeners],
  )

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    // Extra rows on coarse pointer so a fling does not hit unmeasured items as quickly.
    overscan: virtualizerOverscan(10, 24),
    getItemKey,
  })

  useEffect(() => {
    void ensureEmojiMart()
  }, [])

  useEffect(() => {
    send({ type: isAtBottom ? "ATTACH" : "DETACH" })
  }, [isAtBottom, send])

  // `use-stick-to-bottom` only ResizeObserves content height. When aboveChat
  // (quiz card, poll, etc.) grows, the viewport shrinks without a content
  // resize — stickiness is lost. Re-pin when the viewport shrinks and the
  // user was already near the bottom; leave history readers alone.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let prevHeight = el.clientHeight
    let frame = 0
    const observer = new ResizeObserver(() => {
      // Mutating scroll position inside the observer notification can loop
      // (ResizeObserver loop completed with undelivered notifications).
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const nextHeight = el.clientHeight
        const delta = prevHeight - nextHeight
        prevHeight = nextHeight
        if (delta <= 0) return

        // After shrink, distanceFromBottom grows by ~delta. Recover pre-shrink
        // distance so a multi-line card (delta > NEAR_BOTTOM_PX) still re-pins.
        const distanceAfter = el.scrollHeight - el.scrollTop - nextHeight
        const wasNearBottom = distanceAfter - delta <= NEAR_BOTTOM_PX
        if (wasNearBottom) {
          void scrollToBottom({ animation: "instant" })
        }
      })
    })

    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [scrollRef, scrollToBottom])

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
        <ScrollShadowViewport ref={scrollRef} height="100%" css={virtualizerViewportCss}>
          <ScrollArea.Content>
            <VirtualizerContent contentRef={contentRef} totalSize={virtualizer.getTotalSize()}>
              {virtualItems.map((virtualRow) => {
                const message = messages[virtualRow.index]
                if (!message) return null
                const sameUserAsLastMessage = sameChatAttribution(
                  message.user,
                  messages[virtualRow.index - 1]?.user,
                )
                const sameUserAsNextMessage = sameChatAttribution(
                  message.user,
                  messages[virtualRow.index + 1]?.user,
                )
                // Prefer live listener fields (status, personas) but keep the
                // baked presented-identity username/icon from the message (ADR 0150).
                // Cached so an unchanged row keeps its object identity and `memo` holds.
                const displayUser = chatDisplayUser(
                  message,
                  listenersById.get(message.user.userId),
                )

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
                      currentUserId={currentUser.userId}
                      message={message}
                      displayUser={displayUser}
                      sameUserAsLastMessage={sameUserAsLastMessage}
                      sameUserAsNextMessage={sameUserAsNextMessage}
                      expiresAt={message.expiresAt}
                      createdAt={message.createdAt}
                    />
                  </Box>
                )
              })}
            </VirtualizerContent>
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
        opacity={0}
        pointerEvents="none"
        transition="opacity 0.2s"
        transitionDelay="0s"
        data-visible={showJumpToBottom || undefined}
        css={{
          "&[data-visible]": {
            opacity: 1,
            pointerEvents: "auto",
            transitionDelay: "1s",
          },
        }}
        onClick={handleBottomClick}
      >
        {state.context.newMessages > 0 && `${state.context.newMessages} new`}
        <Icon as={LuArrowDown} boxSize={4} />
      </Button>
    </Box>
  )
}

export default ChatWindow
