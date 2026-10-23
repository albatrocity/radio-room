import React, { memo, useMemo } from "react"
import { Alert, Box, Button, Flex, HStack, Icon, Text } from "@chakra-ui/react"
import { format } from "date-fns"
import type { ChatMessageAction } from "@repo/types"
import { ChatMessage } from "../types/ChatMessage"
import { navigateToTarget } from "../lib/navigateToNotificationTarget"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { useCurrentUser } from "../hooks/useActors"
import { useHasInventoryPeek } from "../hooks/useHasInventoryPeek"
import { displayNameForUserId } from "../lib/listenerDisplayName"
import { pierceAnonymousSystemContent } from "../lib/pierceAnonymousSystemContent"
import { PIERCE_INDICATOR_ICON } from "../lib/pierceIndicator"
import { getIcon } from "./PluginComponents/icons"
import { getChatTheme } from "./PresentationThemes/registry"

const mentionCss = {
  "&[data-mention]": {
    bg: "primaryBg",
  },
} as const

function MessageActionButton({ action }: { action: ChatMessageAction }) {
  return (
    <Button
      size="xs"
      variant="outline"
      colorPalette="primary"
      flexShrink={0}
      alignSelf="center"
      onClick={() => navigateToTarget(action.target)}
    >
      {action.label}
    </Button>
  )
}

const SystemMessage = ({ content, timestamp, meta = {}, mentions = [] }: ChatMessage) => {
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const { status, type, title } = meta
  const currentUser = useCurrentUser()
  const pierce = useHasInventoryPeek()
  const PierceIcon = getIcon(PIERCE_INDICATOR_ICON)
  const displayContent = useMemo(
    () =>
      pierceAnonymousSystemContent(
        content,
        meta.maskedUserIds,
        pierce,
        displayNameForUserId,
        meta.maskedLabel,
      ),
    [content, meta.maskedUserIds, meta.maskedLabel, pierce],
  )

  // Check if current user is mentioned (by username)
  const isMention = currentUser?.username ? mentions.includes(currentUser.username) : false

  const showPierce = Boolean(pierce && meta.maskedUserIds?.length && PierceIcon)
  const action = meta.action ? <MessageActionButton action={meta.action} /> : null

  if (type === "prose") {
    if (status) {
      return (
        <Alert.Root
          status={status}
          bg="secondaryBg"
          color="secondaryText"
          borderRadius={0}
          alignItems="flex-start"
          w="full"
          data-mention={isMention || undefined}
          css={mentionCss}
        >
          <Alert.Indicator />
          <Alert.Description flex="1" minW={0}>
            <HStack gap={1.5} align="center">
              {showPierce ? <Icon as={PierceIcon} boxSize={3.5} flexShrink={0} /> : null}
              <ParsedEmojiMessage content={displayContent} />
            </HStack>
          </Alert.Description>
          {action}
        </Alert.Root>
      )
    }
    return (
      <Flex
        px={4}
        py={2}
        w="full"
        borderBottomColor="whiteAlpha.100"
        borderBottomWidth={1}
        alignItems="center"
        flexDirection="column"
        role="group"
        layerStyle="themeTransition"
        data-mention={isMention || undefined}
        css={mentionCss}
      >
        <Box maxW="40rem" w="full" textAlign="center" color="secondaryText" fontSize="sm">
          <HStack gap={1.5} align="start" justify="center">
            {showPierce ? (
              <Icon as={PierceIcon} boxSize={3.5} flexShrink={0} color="secondaryText" />
            ) : null}
            <Box minW={0}>
              <ParsedEmojiMessage content={displayContent} />
            </Box>
          </HStack>
        </Box>
        {action ? <Box mt={1.5}>{action}</Box> : null}
        <HStack gap={1} opacity={0} _groupHover={{ opacity: 1 }}>
          <Text fontSize="2xs" color="secondaryText" opacity={0.7}>
            {dateString}
          </Text>
          <Text fontSize="2xs" color="secondaryText" opacity={0.7}>
            {time}
          </Text>
        </HStack>
      </Flex>
    )
  }

  const ThemedMessage = getChatTheme(meta.theme)
  if (ThemedMessage) {
    const themed = (
      <ThemedMessage
        content={displayContent}
        title={title}
        status={status}
        icon={meta.icon}
        time={time}
      />
    )
    if (!action) return themed
    return (
      <Box>
        {themed}
        <Flex px={3} pb={1.5} justify="flex-end">
          {action}
        </Flex>
      </Box>
    )
  }

  return type === "alert" ? (
    <Alert.Root
      status={status ?? "info"}
      bg="secondaryBg"
      color="secondaryText"
      borderRadius={0}
      data-mention={isMention || undefined}
      css={mentionCss}
    >
      <Alert.Indicator />
      {title && <Alert.Title>{title}</Alert.Title>}
      <Alert.Description>
        <HStack gap={1.5} align="center">
          {showPierce ? <Icon as={PierceIcon} boxSize={3.5} flexShrink={0} /> : null}
          <ParsedEmojiMessage content={displayContent} />
        </HStack>
      </Alert.Description>
      {action}
    </Alert.Root>
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
      role="group"
      bg="none"
      data-mention={isMention || undefined}
      css={mentionCss}
      layerStyle="themeTransition"
    >
      <HStack gap={1.5} align="center">
        {showPierce ? (
          <Icon as={PierceIcon} boxSize={3.5} flexShrink={0} color="secondaryText" />
        ) : null}
        <Text as="span" color="secondaryText" fontSize="sm" textAlign="center">
          <ParsedEmojiMessage content={displayContent} />
        </Text>
      </HStack>
      {action ? <Box mt={1.5}>{action}</Box> : null}
      <HStack gap={1} opacity={0} _groupHover={{ opacity: 1 }}>
        <Text fontSize="2xs" color="secondaryText" opacity={0.7}>
          {dateString}
        </Text>
        <Text fontSize="2xs" color="secondaryText" opacity={0.7}>
          {time}
        </Text>
      </HStack>
    </Flex>
  )
}

export default memo(SystemMessage)
