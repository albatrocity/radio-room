import React, { memo } from "react"
import {
  Alert,
  Flex,
  HStack,
  Text,
} from "@chakra-ui/react"
import { format } from "date-fns"
import { ChatMessage } from "../types/ChatMessage"
import ParsedEmojiMessage from "./ParsedEmojiMessage"

const SystemMessage = ({ content, timestamp, meta = {} }: ChatMessage) => {
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const { status, type, title } = meta
  return type === "alert" ? (
    <Alert.Root status={status ?? "info"}>
      <Alert.Indicator />
      {title && <Alert.Title>{title}</Alert.Title>}
      <Alert.Description>
        <ParsedEmojiMessage content={content} />
      </Alert.Description>
    </Alert.Root>
  ) : (
    <Flex
      px={4}
      py={2}
      borderBottomColor="whiteAlpha.100"
      borderBottomWidth={1}
      alignContent="center"
      justifyItems="center"
      alignItems="center"
      flexDirection="column"
      role="group"
    >
      <Text as="span" color="secondaryText" fontSize="sm" textAlign="center">
        <ParsedEmojiMessage content={content} />
      </Text>
      <HStack gap={1} opacity={0} _groupHover={{ opacity: 1 }}>
        <Text fontSize="2xs" color="secondaryText" opacity={0.7}>
          {dateString}
        </Text>
        <Text fontSize="2xs" color="secondaryText" opacity={0.7}>
          {time}
        </Text>
      </HStack>
    </Flex>
  )
}

export default memo(SystemMessage)
