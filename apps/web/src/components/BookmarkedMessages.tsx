import React, { useCallback } from "react"
import { Box } from "@chakra-ui/react"
import { ChatMessage as ChatMessageType } from "../types/ChatMessage"
import ChatMessage from "./ChatMessage"

import {
  useCurrentUser,
  useBookmarks,
  useChatScrollTargetSend,
  useModalsSend,
} from "../hooks/useActors"

const BookmarkedMessages = () => {
  const currentUser = useCurrentUser()
  const messages = useBookmarks()
  const scrollSend = useChatScrollTargetSend()
  const modalSend = useModalsSend()

  const handleRowClick = useCallback(
    (timestamp: string) => (e: React.MouseEvent | React.KeyboardEvent) => {
      if ("key" in e && e.key !== "Enter" && e.key !== " ") {
        return
      }
      if ("key" in e && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault()
      }
      const el = e.target as HTMLElement
      if (el.closest("button")) {
        return
      }
      scrollSend({ type: "SCROLL_TO_TIMESTAMP", data: timestamp })
      modalSend({ type: "CLOSE" })
    },
    [scrollSend, modalSend],
  )

  return (
    <Box>
      {messages.map((message: ChatMessageType) => (
        <Box
          key={message.timestamp}
          onClick={handleRowClick(message.timestamp)}
          onKeyDown={handleRowClick(message.timestamp)}
          cursor="pointer"
          role="button"
          tabIndex={0}
          aria-label="Jump to message in chat"
        >
          <ChatMessage
            showUsername={true}
            currentUserId={currentUser?.userId ?? ""}
            {...message}
          />
        </Box>
      ))}
    </Box>
  )
}

export default BookmarkedMessages
