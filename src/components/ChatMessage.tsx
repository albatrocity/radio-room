import React, { memo, useEffect, useState, useMemo } from "react"
import {
  Box,
  Flex,
  Image,
  Spacer,
  Stack,
  Text,
  useBreakpointValue,
  Wrap,
  WrapItem,
} from "@chakra-ui/react"
import getUrls from "../lib/getUrls"

import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { User } from "../types/User"
import { EmojiData } from "emoji-mart"
import Timestamp from "./Timestamp"

export interface ChatMessageProps {
  content: string
  mentions: string[]
  timestamp: string
  user: User
  currentUserId: string
  onOpenReactionPicker: () => void
  onReactionClick: (emoji: EmojiData) => void
  showUsername: boolean
  anotherUserMessage: boolean
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
  onOpenReactionPicker,
  onReactionClick,
  showUsername,
  anotherUserMessage,
}: ChatMessageProps) => {
  const [parsedImageUrls, setParsedImageUrls] = useState<string[]>([])
  const [hovered, setHovered] = useState(false)
  const alwaysShowReactionPicker = useBreakpointValue({
    base: true,
    md: false,
  })

  const isMention = mentions.indexOf(currentUserId) > -1
  const urls = useMemo((): string[] => getUrls(content), [content])
  const images = Array.from(
    new Set([...parsedImageUrls, ...urls.filter((x: string) => isImageUrl(x))]),
  )
  const parsedContent = images.reduce((mem, x) => mem.replace(x, ""), content)

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
          <Timestamp value={timestamp} />
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
            {!showUsername && hovered && (
              <Box p={2} position="absolute" top={0} right={2} borderRadius={4}>
                <Timestamp value={timestamp} />
              </Box>
            )}
          </Stack>
        </WrapItem>
      </Wrap>

      <ReactionCounter
        onOpenPicker={onOpenReactionPicker}
        reactTo={{ type: "message", id: timestamp }}
        onReactionClick={onReactionClick}
        showAddButton={alwaysShowReactionPicker || hovered}
      />
    </Box>
  )
}

export default memo(ChatMessage)
