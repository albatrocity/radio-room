import React, { memo } from "react"
import { Box } from "grommet"

import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInput"

const Chat = ({ users }) => {
  return (
    <Box
      height="100%"
      flex={{ grow: 1 }}
      className="chat"
      justify="between"
      gap="small"
    >
      <ChatInput users={users} />
      <ChatMessages />
    </Box>
  )
}

export default memo(Chat)
