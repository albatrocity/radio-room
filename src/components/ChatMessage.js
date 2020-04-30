import React from "react"
import { Box, Paragraph, Avatar, Text } from "grommet"

const ChatMessage = ({ content, timestamp, user }) => {
  return (
    <Box direction="row" gap="small">
      <Avatar></Avatar>
      <Box>
        <Text size="small">{user.username}</Text>
        <Paragraph>{content}</Paragraph>
      </Box>
    </Box>
  )
}

export default ChatMessage
