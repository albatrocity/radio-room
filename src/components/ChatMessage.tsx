import React, { memo, useEffect, useState, useMemo } from "react"
import { Box, Text, Image, Stack, Wrap, WrapItem } from "@chakra-ui/react"
import { format } from "date-fns"
import getUrls from "../lib/getUrls"

import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { User } from "../types/User"
import { EmojiData } from "emoji-mart"

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
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
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
      borderBottom={anotherUserMessage ? undefined : "2px solid gray"}
      background={isMention ? "accent-4" : "none"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      position="relative"
      w="100%"
    >
      {showUsername && (
        <Stack direction={["row"]} justifyContent="space-between">
          <Text my="sm" fontWeight={700}>
            {user.username}
          </Text>
          <Stack flexShrink={0} direction="row" spacing={"1em"}>
            <Text fontSize="xs" color="gray.500">
              {dateString}
            </Text>
            <Text fontSize="xs" color="gray.800">
              {time}
            </Text>
          </Stack>
        </Stack>
      )}
      <Wrap spacing="xs" align="center" w="100%">
        <WrapItem w="100%">
          <Stack direction="row" spacing={2} w="100%">
            <Box flex={{ grow: 1 }}>
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
              <Box
                p={2}
                background="whiteAlpha.900"
                position="absolute"
                top={0}
                right={2}
                borderRadius={4}
              >
                <Stack
                  flexShrink={0}
                  direction="row"
                  spacing={1}
                  justify="between"
                >
                  <Text fontSize="xs" color="gray.500">
                    {time}
                  </Text>
                  <Text fontSize="xs" color="gray.300">
                    {dateString}
                  </Text>
                </Stack>
              </Box>
            )}
          </Stack>
        </WrapItem>
      </Wrap>

      <ReactionCounter
        onOpenPicker={onOpenReactionPicker}
        reactTo={{ type: "message", id: timestamp }}
        onReactionClick={onReactionClick}
        iconColor="dark-5"
        iconHoverColor="brand"
        showAddButton={hovered}
      />
    </Box>
  )
}

export default memo(ChatMessage)
