import React, { memo } from "react"
import { Box, HStack, Text } from "@chakra-ui/react"
import { format } from "date-fns"
import { ChatMessage } from "../types/ChatMessage"

const SystemMessage = ({ content, timestamp, meta = {} }: ChatMessage) => {
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const { status } = meta
  return (
    <Box
      p={1}
      border={{ side: "bottom" }}
      background={status === "critical" ? "status-critical" : "light-1"}
      alignItems="center"
    >
      <Text
        as="p"
        style={{ maxWidth: "none" }}
        size="small"
        margin={{ bottom: "xsmall" }}
      >
        {content}
      </Text>
      <HStack gap={1}>
        <Text size="xsmall" color="dark-3">
          {time}
        </Text>
        <Text size="xsmall" color="dark-4">
          {dateString}
        </Text>
      </HStack>
    </Box>
  )
}

export default memo(SystemMessage)
