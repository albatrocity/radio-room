import React, { useEffect, useContext } from "react"
import { Box } from "grommet"

import ChatMessage from "./ChatMessage"
import RoomContext from "../contexts/RoomContext"

const ChatMessages = () => {
  const { state, dispatch } = useContext(RoomContext)
  return (
    <Box>
      {state.messages.map(x => (
        <ChatMessage key={x.timestamp} {...x} />
      ))}
    </Box>
  )
}

export default ChatMessages
