import React from "react"
import { Box } from "grommet"

import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInput"

const Chat = () => {
  return (
    <Box>
      <ChatMessages />
      <ChatInput />
    </Box>
  )
}

export default Chat
