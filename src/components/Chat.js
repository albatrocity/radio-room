import React from "react"
import { Box } from "grommet"

import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInput"

const Chat = () => {
  return (
    <Box
      height="100%"
      flex={{ grow: 1 }}
      className="chat"
      justify="between"
      gap="small"
    >
      <ChatInput />
      <ChatMessages />
    </Box>
  )
}

export default Chat
