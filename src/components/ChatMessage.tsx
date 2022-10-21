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
  reactions: []
  showUsername: boolean
  anotherUserMessage: boolean
}

const ChatMessage = ({
  content,
  mentions = [],
  timestamp,
  user,
  currentUserId,
  onOpenReactionPicker,
  onReactionClick,
  reactions,
  showUsername,
  anotherUserMessage,
}: ChatMessageProps) => {
  function isImageUrl(url: string) {
    return url.match(/\.(jpeg|jpg|gif|png)$/) != null
  }
  const [parsedImageUrls, setParsedImageUrls] = useState<string[]>([])
  const [hovered, setHovered] = useState(false)
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const isMention = mentions.indexOf(currentUserId) > -1
  const urls = useMemo((): string[] => getUrls(content), [content])
  const images = [
    ...parsedImageUrls,
    ...urls.filter((x: string) => isImageUrl(x)),
  ]
  const parsedContent = images.reduce((mem, x) => mem.replace(x, ""), content)

  useEffect(() => {
    async function testUrls() {
      const responses = await Promise.all(
        urls.filter((x) => isImageUrl(x)).map((x) => fetch(x)),
      )
      const blobs = await Promise.all(responses.map((x) => x.blob()))
      const imageUrls = blobs.reduce<string[]>((mem, x) => {
        if ((x?.type || "").indexOf("image") > -1) {
          mem.push(urls[blobs.indexOf(x)])
        }
        return mem
      }, [])
      if (imageUrls.length) {
        setParsedImageUrls(imageUrls)
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
    >
      {showUsername && (
        <Stack direction={["row"]} justifyContent="space-between">
          <Text my="sm" fontWeight={700}>
            {user.username}
          </Text>
          <Stack flexShrink={0} direction="row" spacing="sm">
            <Text fontSize="xs" color="dark-3">
              {time}
            </Text>
            <Text fontSize="xs" color="dark-4">
              {dateString}
            </Text>
          </Stack>
        </Stack>
      )}
      <Wrap spacing="xs" align="center" w="100%">
        <WrapItem w="100%">
          <Stack direction="row" spacing={2} w="100%">
            <Box flex={{ grow: 1 }}>
              <Text as="p" m={0} wordBreak={"break-word"}>
                <ParsedEmojiMessage content={parsedContent} />
              </Text>
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
            )}
          </Stack>
        </WrapItem>
      </Wrap>

      <ReactionCounter
        onOpenPicker={onOpenReactionPicker}
        reactTo={{ type: "message", id: timestamp }}
        reactions={reactions}
        onReactionClick={onReactionClick}
        iconColor="dark-5"
        iconHoverColor="brand"
        showAddButton={hovered}
      />
    </Box>
  )
}

export default memo(ChatMessage)
