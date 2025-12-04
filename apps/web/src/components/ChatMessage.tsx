import React, { memo, useEffect, useState, useMemo, useCallback } from "react"
import {
  Box,
  Flex,
  HStack,
  Icon,
  IconButton,
  Image,
  Spacer,
  Stack,
  Text,
  useBreakpointValue,
  Wrap,
} from "@chakra-ui/react"
import { FiBookmark } from "react-icons/fi"

import getUrls from "../lib/getUrls"
import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { User } from "../types/User"
import Timestamp from "./Timestamp"

import { useAuthStore } from "../state/authStore"
import { useBookmarkedChatStore, useBookmarks } from "../state/bookmarkedChatStore"

export interface ChatMessageProps {
  content: string
  mentions?: string[]
  timestamp: string
  user: User
  currentUserId: string
  showUsername?: boolean
  anotherUserMessage?: boolean
}

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|webp|avif|gif)$/.test(url)
}

function isImgUrl(url: string) {
  return fetch(url, { method: "HEAD" }).then((res) => {
    return res?.headers?.get("Content-Type")?.startsWith("image")
  })
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
  const [parsedImageUrls, setParsedImageUrls] = useState<string[]>([])
  const currentIsAdmin = useAuthStore((s) => s.state.context.isAdmin)
  const { send: bookmarkSend } = useBookmarkedChatStore()
  const isBookmarked = useBookmarks().find(({ id }) => id === timestamp)

  const [hovered, setHovered] = useState(false)
  const alwaysShowReactionPicker = useBreakpointValue({
    base: true,
    md: false,
  })
  const showFloatingTimestamp = (!showUsername && hovered) || (isBookmarked && !showUsername)

  const isMention = mentions.indexOf(currentUserId) > -1
  const urls = useMemo((): string[] => getUrls(content), [content])

  // Memoize images to prevent recalculation on every render
  const images = useMemo(
    () => Array.from(new Set([...parsedImageUrls, ...urls.filter((x: string) => isImageUrl(x))])),
    [parsedImageUrls, urls],
  )

  // Memoize parsed content
  const parsedContent = useMemo(
    () => images.reduce((mem, x) => mem.replace(x, ""), content),
    [images, content],
  )

  const handleBookmark = useCallback(() => {
    bookmarkSend("TOGGLE_MESSAGE", {
      data: {
        id: timestamp,
        timestamp,
        content,
        user,
        mentions,
      },
    })
  }, [bookmarkSend, timestamp, content, user, mentions])

  useEffect(() => {
    async function testUrls() {
      try {
        const responses = await Promise.all(urls.map((x) => isImgUrl(x)))

        const testedImageUrls = responses
          .map((res, i) => {
            if (res) {
              return urls[i]
            } else {
              return ""
            }
          })
          .filter((x) => x !== "")

        if (testedImageUrls.length) {
          setParsedImageUrls(testedImageUrls)
        }
      } catch (e) {
        console.log(e)
      }
    }
    testUrls()
  }, [urls])

  return (
    <Box
      px={3}
      py={1}
      borderBottomWidth={anotherUserMessage ? 0 : 1}
      borderBottomColor="secondaryBorder"
      background={isMention ? "primaryBg" : "none"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      position="relative"
      w="100%"
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
              <ParsedEmojiMessage content={parsedContent} />
              {images.length > 0 && (
                <Stack direction="column" gap={2}>
                  {images.map((x) => (
                    <Box key={x}>
                      <Image w="100%" maxW="400px" objectFit="contain" src={x} />
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
            {showFloatingTimestamp && (
              <HStack p={2} position="absolute" top={0} right={2} borderRadius={4} bg="appBg">
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
