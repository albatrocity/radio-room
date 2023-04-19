import React from "react"
import { Box } from "@chakra-ui/react"
import { ChatMessage as ChatMessageType } from "../types/ChatMessage"
import ChatMessage from "./ChatMessage"

import { useCurrentUser } from "../state/authStore"
import { useBookmarks } from "../state/bookmarkedChatStore"

const BookmarkedMessages = () => {
  const currentUser = useCurrentUser()
  const messages = useBookmarks()

  return (
    <Box>
      {messages.map((message: ChatMessageType) => (
        <ChatMessage
          showUsername={true}
          currentUserId={currentUser.userId}
          key={message.timestamp}
          {...message}
        />
      ))}
    </Box>
  )
}

export default BookmarkedMessages
