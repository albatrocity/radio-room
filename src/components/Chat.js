import React, { memo, useMemo } from "react"
import { useMachine } from "@xstate/react"
import { Box } from "grommet"

import socket from "../lib/socket"
import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInputNative"
import { chatMachine } from "../machines/chatMachine"

const Chat = ({ modalActive, onOpenReactionPicker, onReactionClick }) => {
  const [chatState, chatSend] = useMachine(chatMachine)

  return (
    <Box
      height="100%"
      flex={{ grow: 1 }}
      className="chat"
      justify="between"
      gap="small"
    >
      <ChatInput
        modalActive={modalActive}
        onTypingStart={() => chatSend("START_TYPING")}
        onTypingStop={() => chatSend("STOP_TYPING")}
        onSend={msg => chatSend("SUBMIT_MESSAGE", { data: msg })}
      />
      <ChatMessages
        onOpenReactionPicker={onOpenReactionPicker}
        onReactionClick={onReactionClick}
        messages={chatState.context.messages}
        currentUserId={
          chatState.context.currentUser
            ? chatState.context.currentUser.userId
            : null
        }
      />
    </Box>
  )
}

export default memo(Chat)
