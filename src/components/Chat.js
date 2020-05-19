import React, { memo, useContext, useMemo } from "react"
import { useMachine } from "@xstate/react"
import { Box } from "grommet"

import socket from "../lib/socket"
import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInput"
import { handleNotifications } from "../lib/handleNotifications"
import AuthContext from "../contexts/AuthContext"
import { chatMachine } from "../machines/chatMachine"

const Chat = ({ users, modalActive }) => {
  const { state: authState } = useContext(AuthContext)
  const [chatState, chatSend] = useMachine(chatMachine, {
    activities: {
      setupListeners: ctx => {
        const handleNewMessage = payload => {
          handleNotifications(payload)
          chatSend({ type: "MESSAGE_RECEIVED", data: payload })
        }
        const handleTyping = payload => {
          chatSend({ type: "TYPING", data: payload })
        }
        const handleInit = payload => {
          chatSend({ type: "LOGIN", data: payload })
        }

        socket.on("init", handleInit)
        socket.on("new message", handleNewMessage)
        socket.on("typing", handleTyping)

        return () => {
          socket.removeListener("init", handleInit)
          socket.removeListener("new message", handleNewMessage)
          socket.removeListener("typing", handleTyping)
        }
      },
    },
    actions: {
      sendMessage: (context, event) => {
        socket.emit("new message", event.data)
      },
      startTyping: (context, event) => {
        socket.emit("typing")
      },
      stopTyping: (context, event) => {
        socket.emit("stop typing")
      },
    },
  })

  const currentlyTyping = useMemo(() => chatState.context.typing, [
    chatState.context.typing,
  ])

  return (
    <Box
      height="100%"
      flex={{ grow: 1 }}
      className="chat"
      justify="between"
      gap="small"
    >
      <ChatInput
        users={users}
        modalActive={modalActive}
        onTypingStart={() => chatSend("START_TYPING")}
        onTypingStop={() => chatSend("STOP_TYPING")}
        onSend={msg => chatSend("SUBMIT_MESSAGE", { data: msg })}
      />
      <ChatMessages
        messages={chatState.context.messages}
        currentUserId={authState.context.currentUser.userId}
        typing={currentlyTyping}
      />
    </Box>
  )
}

export default memo(Chat)
