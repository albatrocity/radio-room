import React, { memo, useState, useCallback, useMemo } from "react"
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
import { getChatPersonaBadges } from "../lib/userPersonas"
import { PersonaBadge } from "./PersonaBadge"
import { ExpiryBar } from "./ExpiryBar"

export interface ChatMessageProps {
  content: string
  contentSegments?: TextSegment[]
  mentions?: string[]
  timestamp: string
  user: User
  currentUserId: string
  showUsername?: boolean
  anotherUserMessage?: boolean
  /** When set, message is a sender-only preview until this time (ms since epoch). */
  expiresAt?: number
  /** When set, used for progress bar timing (pairs with expiresAt). */
  createdAt?: number
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
  expiresAt,
  createdAt: createdAtProp,
}: ChatMessageProps) => {
  // Use createdAt prop if available (for expirable messages), otherwise parse from timestamp
  const createdAt = useMemo(
    () => createdAtProp ?? new Date(timestamp).getTime(),
    [createdAtProp, timestamp],
  )

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
  const chatPersonaBadges = getChatPersonaBadges(user)

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
          <HStack gap={1} minW={0}>
            {chatPersonaBadges.map((persona) => (
              <PersonaBadge
                key={persona.personaId}
                persona={persona}
                color={persona.personaId === "vip" ? "yellow.400" : undefined}
              />
            ))}
            <Text css={styles.username}>{user.username}</Text>
          </HStack>
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

      {expiresAt != null && !Number.isNaN(createdAt) && expiresAt > createdAt && (
        <ExpiryBar
          startAt={createdAt}
          endAt={expiresAt}
          color="gray.500"
          orientation="horizontal"
          height="3px"
        />
      )}

      {expiresAt == null && (
        <ReactionCounter
          reactTo={{ type: "message", id: timestamp }}
          showAddButton={alwaysShowReactionPicker || hovered}
          buttonColorScheme="primary"
          buttonVariant="ghost"
          reactionVariant="reactionBright"
        />
      )}

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
