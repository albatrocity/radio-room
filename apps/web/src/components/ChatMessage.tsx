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
  useSlotRecipe,
  Wrap,
} from "@chakra-ui/react"
import { LuBookmark, LuTrash2 } from "react-icons/lu"

import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { MessageSegments } from "./MessageSegments"
import ConfirmationDialog from "./ConfirmationDialog"
import { User } from "../types/User"
import Timestamp from "./Timestamp"
import { chatMessageRecipe } from "../theme/chatMessageRecipe"

import type { TextSegment } from "@repo/types"
import { useIsAdmin, useBookmarks, useBookmarksSend, useChatSend } from "../hooks/useActors"

export interface ChatMessageProps {
  content: string
  contentSegments?: TextSegment[]
  mentions?: string[]
  timestamp: string
  user: User
  currentUserId: string
  showUsername?: boolean
  anotherUserMessage?: boolean
}

const ChatMessage = ({
  content,
  contentSegments,
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

  const recipe = useSlotRecipe({ recipe: chatMessageRecipe })
  const styles = recipe({
    isMention,
    isBookmarked: !!isBookmarked,
    hasBorder: !anotherUserMessage,
  })

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
      css={styles.root}
      layerStyle="themeTransition"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-screen-effect-target="message"
      data-message-id={timestamp}
    >
      {showUsername && (
        <Flex css={styles.header}>
          <Text css={styles.username}>{user.username}</Text>
          <Spacer />
          <HStack css={styles.headerActions}>
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
      <Wrap css={styles.content}>
        <Box css={styles.messageBody}>
          <Stack direction="row" gap={2} w="100%">
            {contentSegments && contentSegments.length > 0 ? (
              <Box flexGrow={1} minW={0} textStyle="chatMessage">
                <MessageSegments segments={contentSegments} />
              </Box>
            ) : (
              <ParsedEmojiMessage content={content} />
            )}
            {showFloatingTimestamp && (
              <HStack css={styles.floatingActions} layerStyle="themeTransition">
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
                    <Icon as={LuBookmark} css={styles.bookmarkIcon} />
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
