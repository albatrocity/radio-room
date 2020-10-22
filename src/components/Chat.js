import React, { memo, useMemo } from "react"
import { useMachine, useService } from "@xstate/react"
import { Box } from "grommet"

import socket from "../lib/socket"
import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInputNative"
import TypingIndicator from "./TypingIndicator"
import { chatMachine } from "../machines/chatMachine"
import { useAuth } from "../contexts/useAuth"

const Chat = ({ modalActive, onOpenReactionPicker, onReactionClick }) => {
  const [authState] = useAuth()
  const { currentUser } = authState.context
  const [chatState, chatSend] = useMachine(chatMachine, {
    context: { currentUser },
  })
  const currentUserId = chatState.context.currentUser
    ? chatState.context.currentUser.userId
    : null

  return (
    <Box
      height="100%"
      flex={{ grow: 1 }}
      className="chat"
      justify="between"
      gap="small"
    >
      <Box>
        <ChatInput
          modalActive={modalActive}
          onTypingStart={() => chatSend("START_TYPING")}
          onTypingStop={() => chatSend("STOP_TYPING")}
          onSend={msg => chatSend("SUBMIT_MESSAGE", { data: msg })}
        />
        <TypingIndicator currentUserId={currentUserId} />
      </Box>
      <ChatMessages
        onOpenReactionPicker={onOpenReactionPicker}
        onReactionClick={onReactionClick}
        messages={chatState.context.messages}
        currentUserId={currentUserId}
      />
    </Box>
  )
}

export default memo(Chat)
