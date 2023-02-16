import React from "react"
import { Box } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import { AuthContext } from "../machines/authMachine"
import { ChatMessage as ChatMessageType } from "../types/ChatMessage"
import { User } from "../types/User"
import ChatMessage from "./ChatMessage"
import useGlobalContext from "./useGlobalContext"

type Props = {}

const BookmarkedMessages = (props: Props) => {
  const globalServices = useGlobalContext()
  const messages = useSelector(
    globalServices.bookmarkedChatService,
    (state) => state.context.collection,
  )
  const currentUser = useSelector(
    globalServices.authService,
    (state: { context: AuthContext }): User => state.context.currentUser,
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
