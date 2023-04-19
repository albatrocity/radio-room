import React from "react"
import { Box } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import { ChatMessage as ChatMessageType } from "../types/ChatMessage"
import ChatMessage from "./ChatMessage"
import useGlobalContext from "./useGlobalContext"

import { useCurrentUser } from "../state/authStore"

const BookmarkedMessages = () => {
  const globalServices = useGlobalContext()
  const currentUser = useCurrentUser()

  const messages = useSelector(
    globalServices.bookmarkedChatService,
    (state) => state.context.collection,
  )

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
