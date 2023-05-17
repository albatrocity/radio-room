import React, { memo } from "react"
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
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
    <Alert status={status ?? "info"}>
      <AlertIcon />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{content}</AlertDescription>
    </Alert>
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
    >
      <Text as="span" color="secondaryText" fontSize="sm" textAlign="center">
        <ParsedEmojiMessage content={content} />
      </Text>
      <HStack gap={1}>
        <Text fontSize="xs" color="secondaryText" opacity={0.7}>
          {dateString}
        </Text>
        <Text fontSize="xs" color="secondaryText" opacity={0.7}>
          {time}
        </Text>
      </HStack>
    </Flex>
  )
}

export default memo(SystemMessage)
