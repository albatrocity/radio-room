import React, { memo } from "react"
import { Flex, HStack, Text } from "@chakra-ui/react"
import { format } from "date-fns"
import { ChatMessage } from "../types/ChatMessage"

const SystemMessage = ({ content, timestamp, meta = {} }: ChatMessage) => {
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const { status } = meta
  return (
    <Flex
      px={4}
      py={2}
      borderBottomColor="primary"
      borderBottomWidth={1}
      background={status === "critical" ? "critical" : "system"}
      alignContent="center"
      justifyItems="center"
      alignItems="center"
      flexDirection="column"
    >
      <Text as="p" fontSize="sm" textAlign="center">
        {content}
      </Text>
      <HStack gap={1}>
        <Text fontSize="xs">{dateString}</Text>
        <Text fontSize="xs">{time}</Text>
      </HStack>
    </Flex>
  )
}

export default memo(SystemMessage)
