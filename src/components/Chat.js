import React, { memo, useContext } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { Box } from "grommet"

import { GlobalStateContext } from "../contexts/global"
import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInputNative"
import TypingIndicator from "./TypingIndicator"
import { chatMachine } from "../machines/chatMachine"

const currentUserSelector = (state) => state.context.currentUser
const isUnauthorizedSelector = (state) => state.matches("unauthorized")

const Chat = ({ modalActive, onOpenReactionPicker, onReactionClick }) => {
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
  const currentUserId = chatState.context.currentUser
    ? chatState.context.currentUser.userId
    : null

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
          onSend={(msg) => chatSend("SUBMIT_MESSAGE", { data: msg })}
        />
      </Box>
    </Box>
  )
}

export default memo(Chat)
