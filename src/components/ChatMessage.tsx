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
  WrapItem,
} from "@chakra-ui/react"
import { motion } from "framer-motion"
import { FiBookmark } from "react-icons/fi"

import getUrls from "../lib/getUrls"
import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { User } from "../types/User"
import Timestamp from "./Timestamp"
import useGlobalContext from "./useGlobalContext"
import { useSelector } from "@xstate/react"

import { useAuthStore } from "../state/authStore"

const MotionBox = motion(Box)

export interface ChatMessageProps {
  content: string
  mentions: string[]
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
  const globalServices = useGlobalContext()
  const currentIsAdmin = useAuthStore((s) => s.state.context.isAdmin)

  const isBookmarked = useSelector(
    globalServices.bookmarkedChatService,
    (state) => !!state.context.collection.find(({ id }) => id === timestamp),
  )

  const [hovered, setHovered] = useState(false)
  const alwaysShowReactionPicker = useBreakpointValue({
    base: true,
    md: false,
  })
  const showFloatingTimestamp =
    (!showUsername && hovered) || (isBookmarked && !showUsername)

  const isMention = mentions.indexOf(currentUserId) > -1
  const urls = useMemo((): string[] => getUrls(content), [content])
  const images = Array.from(
    new Set([...parsedImageUrls, ...urls.filter((x: string) => isImageUrl(x))]),
  )
  const parsedContent = images.reduce((mem, x) => mem.replace(x, ""), content)

  const handleBookmark = useCallback(() => {
    globalServices.bookmarkedChatService.send("TOGGLE_MESSAGE", {
      data: {
        id: timestamp,
        timestamp,
        content,
        user,
        mentions,
      },
    })
  }, [globalServices.bookmarkedChatService])

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
    <MotionBox
      px={3}
      py={1}
      borderBottomWidth={anotherUserMessage ? 0 : 1}
      borderBottomColor="secondaryBorder"
      background={isMention ? "primaryBg" : "none"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      position="relative"
      w="100%"
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      transition={{
        type: "tween",
        duration: 0.4,
      }}
    >
      {showUsername && (
        <Flex
          direction="row"
          justify="between"
          grow={1}
          align="center"
          w="100%"
        >
          <Text my="sm" fontWeight={700}>
            {user.username}
          </Text>
          <Spacer />
          <HStack>
            {currentIsAdmin && (
              <IconButton
                aria-label="Bookmark message"
                colorScheme={"primary"}
                variant={isBookmarked ? "solid" : "ghost"}
                icon={<Icon as={FiBookmark} />}
                size="xs"
                onClick={handleBookmark}
              />
            )}
            <Timestamp value={timestamp} />
          </HStack>
        </Flex>
      )}
      <Wrap spacing="xs" align="center" w="100%">
        <WrapItem w="100%">
          <Stack direction="row" spacing={2} w="100%">
            <Box flex={{ grow: 1 }} textStyle="chatMessage">
              <ParsedEmojiMessage content={parsedContent} />
              {images.length > 0 && (
                <Stack direction="column" spacing={2}>
                  {images.map((x) => (
                    <Box key={x}>
                      <Image
                        w="100%"
                        maxW="400px"
                        objectFit="contain"
                        src={x}
                      />
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
            {showFloatingTimestamp && (
              <HStack
                p={2}
                position="absolute"
                top={0}
                right={2}
                borderRadius={4}
                bg="appBg"
              >
                {currentIsAdmin && (
                  <IconButton
                    aria-label="Bookmark message"
                    colorScheme="primary"
                    variant="ghost"
                    icon={<Icon as={FiBookmark} />}
                    variant={isBookmarked ? "solid" : "ghost"}
                    size="xs"
                    onClick={handleBookmark}
                  />
                )}
                <Timestamp value={timestamp} />
              </HStack>
            )}
          </Stack>
        </WrapItem>
      </Wrap>

      <ReactionCounter
        reactTo={{ type: "message", id: timestamp }}
        showAddButton={alwaysShowReactionPicker || hovered}
      />
    </MotionBox>
  )
}

export default memo(ChatMessage)
