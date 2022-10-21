import React, { memo, useContext } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { Box, Flex } from "@chakra-ui/react"

import { GlobalStateContext } from "../contexts/global"
import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInputNative"
import TypingIndicator from "./TypingIndicator"
import { chatMachine } from "../machines/chatMachine"
import { AuthContext } from "../machines/authMachine"
import { ChatMessage } from "../types/ChatMessage"
import { User } from "../types/User"
import { EmojiData } from "emoji-mart"

const currentUserSelector = (state: { context: AuthContext }): User =>
  state.context.currentUser
const isUnauthorizedSelector = (state) => state.matches("unauthorized")

interface ChatProps {
  modalActive: boolean
  onOpenReactionPicker: () => void
  onReactionClick: (emoji: EmojiData) => void
}

const Chat = ({
  modalActive,
  onOpenReactionPicker,
  onReactionClick,
}: ChatProps) => {
  const globalServices = useContext(GlobalStateContext)
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const isUnauthorized = useSelector(
    globalServices.authService,
    isUnauthorizedSelector,
  )
  const [chatState, chatSend] = useMachine(chatMachine, {
    context: { currentUser },
  })
  const currentUserId = currentUser.userId

  return (
    <Flex
      direction="column"
      className="chat"
      height="100%"
      justify="between"
      grow={1}
      shrink={1}
      gap="small"
      sx={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
    >
      <Box h="100%" w="100%" className="messages-container">
        <ChatMessages
          onOpenReactionPicker={onOpenReactionPicker}
          onReactionClick={onReactionClick}
          messages={chatState.context.messages}
          currentUserId={currentUserId}
        />
      </Box>
      <Box px={2} py={2}>
        <TypingIndicator currentUserId={currentUserId} />
        <ChatInput
          modalActive={modalActive}
          onTypingStart={() => chatSend("START_TYPING")}
          onTypingStop={() => chatSend("STOP_TYPING")}
          onSend={(msg: ChatMessage) =>
            chatSend("SUBMIT_MESSAGE", { data: msg })
          }
        />
      </Box>
    </Flex>
  )
}

export default memo(Chat)
