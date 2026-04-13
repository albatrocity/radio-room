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
import { LuBookmark, LuTrash2 } from "react-icons/lu"

import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import ConfirmationDialog from "./ConfirmationDialog"
import { User } from "../types/User"
import Timestamp from "./Timestamp"

import { useIsAdmin, useBookmarks, useBookmarksSend, useChatSend } from "../hooks/useActors"

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
  const chatSend = useChatSend()
  const bookmarkSend = useBookmarksSend()
  const bookmarks = useBookmarks()
  const isBookmarked = bookmarks.find(({ id }) => id === timestamp)

  const [hovered, setHovered] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
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

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    chatSend({ type: "DELETE_MESSAGE", data: { timestamp } })
    setIsDeleteDialogOpen(false)
  }, [chatSend, timestamp])

  const handleDeleteCancel = useCallback(() => {
    setIsDeleteDialogOpen(false)
  }, [])

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
                aria-label="Delete message"
                colorPalette="red"
                variant="ghost"
                size="xs"
                onClick={handleDeleteClick}
              >
                <Icon as={LuTrash2} />
              </IconButton>
            )}
            {currentIsAdmin && (
              <IconButton
                aria-label="Bookmark message"
                colorPalette="primary"
                variant={isBookmarked ? "solid" : "ghost"}
                size="xs"
                onClick={handleBookmark}
              >
                <Icon as={LuBookmark} />
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
                    aria-label="Delete message"
                    colorPalette="red"
                    variant="ghost"
                    size="xs"
                    onClick={handleDeleteClick}
                  >
                    <Icon as={LuTrash2} />
                  </IconButton>
                )}
                {currentIsAdmin && (
                  <IconButton
                    aria-label="Bookmark message"
                    colorPalette="primary"
                    variant={isBookmarked ? "solid" : "ghost"}
                    size="xs"
                    onClick={handleBookmark}
                  >
                    <Icon as={LuBookmark} />
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

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Message"
        body={<Text>Are you sure you want to delete this message? This cannot be undone.</Text>}
        confirmLabel="Delete"
        isDangerous
      />
    </Box>
  )
}

export default memo(ChatMessage)
