import React, { memo, useCallback, useContext, useMemo } from "react"
import { Box } from "grommet"

import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInput"
import RoomContext from "../contexts/RoomContext"

const Chat = () => {
  const { state, send } = useContext(RoomContext)
  const sendMessage = useCallback((msg) => send("SEND_MESSAGE", { payload: msg }), [send])
  const stopTyping = useCallback(() => send("STOP_TYPING"), [send])
  const startTyping = useCallback(() => send("START_TYPING"), [send])

  return (
    <Box
      height="100%"
      flex={{ grow: 1 }}
      className="chat"
      justify="between"
      gap="small"
    >
      <ChatInput
        users={state.users}
        onTypingStart={() => startTyping()}
        onTypingStop={() => stopTyping()}
        onSend={(msg) => sendMessage(msg)}
      />
      <ChatMessages messages={state.messages} currentUserId={state.currentUser.userId} />
    </Box>
  )
}

export default memo(Chat)
