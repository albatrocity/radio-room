import React, { memo, useState, useCallback } from "react"
import {
  Box,
  Flex,
  HStack,
  Icon,
  IconButton,
  Spacer,
  Stack,
  Text,
  useBreakpointValue,
  Wrap,
} from "@chakra-ui/react"
import { FiBookmark } from "react-icons/fi"

import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { User } from "../types/User"
import Timestamp from "./Timestamp"

import { useIsAdmin, useBookmarks, useBookmarksSend } from "../hooks/useActors"

export interface ChatMessageProps {
  content: string
  mentions?: string[]
  timestamp: string
  user: User
  currentUserId: string
  showUsername?: boolean
  anotherUserMessage?: boolean
}

const ChatMessage = ({
  content,
  mentions = [],
  timestamp,
  user,
  currentUserId,
  showUsername = false,
  anotherUserMessage = false,
}: ChatMessageProps) => {
  const currentIsAdmin = useIsAdmin()
  const bookmarkSend = useBookmarksSend()
  const bookmarks = useBookmarks()
  const isBookmarked = bookmarks.find(({ id }) => id === timestamp)

  const [hovered, setHovered] = useState(false)
  const alwaysShowReactionPicker = useBreakpointValue({
    base: true,
    md: false,
  })
  const showFloatingTimestamp = (!showUsername && hovered) || (isBookmarked && !showUsername)

  const isMention = mentions.indexOf(currentUserId) > -1

  const handleBookmark = useCallback(() => {
    bookmarkSend({
      type: "TOGGLE_MESSAGE",
      data: {
        id: timestamp,
        timestamp,
        content,
        user,
        mentions,
      },
    })
  }, [bookmarkSend, timestamp, content, user, mentions])

  return (
    <Box
      px={3}
      py={1}
      borderBottomWidth={anotherUserMessage ? 0 : 1}
      borderBottomColor="secondaryBorder"
      background={isMention ? "primaryBg" : "none"}
      layerStyle="themeTransition"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      position="relative"
      w="100%"
      data-screen-effect-target="message"
      data-message-id={timestamp}
    >
      {showUsername && (
        <Flex direction="row" justify="between" grow={1} align="center" w="100%">
          <Text my="sm" fontWeight={700}>
            {user.username}
          </Text>
          <Spacer />
          <HStack>
            {currentIsAdmin && (
              <IconButton
                aria-label="Bookmark message"
                colorPalette="primary"
                variant={isBookmarked ? "solid" : "ghost"}
                size="xs"
                onClick={handleBookmark}
              >
                <Icon as={FiBookmark} />
              </IconButton>
            )}
            <Timestamp value={timestamp} />
          </HStack>
        </Flex>
      )}
      <Wrap gap="1" align="center" w="100%">
        <Box w="100%">
          <Stack direction="row" gap={2} w="100%">
            <Box flex={{ grow: 1 }} textStyle="chatMessage">
              <ParsedEmojiMessage content={content} />
            </Box>
            {showFloatingTimestamp && (
              <HStack
                p={2}
                position="absolute"
                top={0}
                right={2}
                borderRadius={4}
                bg="appBg"
                layerStyle="themeTransition"
              >
                {currentIsAdmin && (
                  <IconButton
                    aria-label="Bookmark message"
                    colorPalette="primary"
                    variant={isBookmarked ? "solid" : "ghost"}
                    size="xs"
                    onClick={handleBookmark}
                  >
                    <Icon as={FiBookmark} />
                  </IconButton>
                )}
                <Timestamp value={timestamp} />
              </HStack>
            )}
          </Stack>
        </Box>
      </Wrap>

      <ReactionCounter
        reactTo={{ type: "message", id: timestamp }}
        showAddButton={alwaysShowReactionPicker || hovered}
        buttonColorScheme="primary"
        buttonVariant="ghost"
        reactionVariant="reactionBright"
      />
    </Box>
  )
}

export default memo(ChatMessage)
