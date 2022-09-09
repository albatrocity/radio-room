import React, { memo, useContext } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { Box } from "grommet"

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
    <Box
      className="chat"
      height="100%"
      justify="between"
      flex={{ grow: 1, shrink: 1 }}
      gap="small"
      style={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
    >
      <Box height="100%" className="messages-container">
        <ChatMessages
          onOpenReactionPicker={onOpenReactionPicker}
          onReactionClick={onReactionClick}
          messages={chatState.context.messages}
          currentUserId={currentUserId}
        />
      </Box>
      <Box>
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
    </Box>
  )
}

export default memo(Chat)
