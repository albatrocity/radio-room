import React, { memo } from "react"
import { Box, Paragraph, Heading, Text } from "grommet"
import Linkify from "react-linkify"
import { format } from "date-fns"
import { includes } from "lodash/fp"

const ChatMessage = ({
  content,
  mentions = [],
  timestamp,
  user,
  currentUserId,
}) => {
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const isMention = includes(currentUserId, mentions)
  return (
    <Box
      pad={isMention ? "small" : { vertical: "small" }}
      border={{ side: "bottom" }}
      background={isMention ? "accent-4" : "none"}
    >
      <Heading level={4} margin={{ bottom: "xsmall", top: "xsmall" }}>
        {user.username}
      </Heading>
      <Paragraph margin={{ bottom: "xsmall" }}>
        <Linkify>{content}</Linkify>
      </Paragraph>
      <Box direction="row" gap="xsmall">
        <Text size="xsmall" color="dark-3">
          {time}
        </Text>
        <Text size="xsmall" color="dark-4">
          {dateString}
        </Text>
      </Box>
    </Box>
  )
}

export default memo(ChatMessage)
