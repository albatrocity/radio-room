import React, { memo, useMemo } from "react"
import { useMachine, useService } from "@xstate/react"
import { Box } from "grommet"
import styled from "styled-components"

import socket from "../lib/socket"
import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInputNative"
import TypingIndicator from "./TypingIndicator"
import { chatMachine } from "../machines/chatMachine"
import { useAuth } from "../contexts/useAuth"

const MessagesContainer = styled(Box)`
  .scroll-to-bottom {
    height: 100%;
    position: relative;

    .default-scroll-button {
      display: none;
    }
  }
  .scroll-view {
    height: 100%;
    overflow-y: auto;
    width: 100%;
  }
`

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
      className="chat"
      height="100%"
      justify="between"
      flex={{ grow: 1, shrink: 1 }}
      gap="small"
      style={{
        filter: authState.matches("unauthorized") ? "blur(0.5rem)" : "none",
      }}
    >
      <MessagesContainer
        height="100%"
        flex={{ shrink: 1, grow: 1 }}
        className="messages-container"
      >
        <ChatMessages
          onOpenReactionPicker={onOpenReactionPicker}
          onReactionClick={onReactionClick}
          messages={chatState.context.messages}
          currentUserId={currentUserId}
        />
      </MessagesContainer>
      <Box>
        <TypingIndicator currentUserId={currentUserId} />
        <ChatInput
          modalActive={modalActive}
          onTypingStart={() => chatSend("START_TYPING")}
          onTypingStop={() => chatSend("STOP_TYPING")}
          onSend={msg => chatSend("SUBMIT_MESSAGE", { data: msg })}
        />
      </Box>
    </Box>
  )
}

export default memo(Chat)
