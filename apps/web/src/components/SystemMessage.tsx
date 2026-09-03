import React, { memo, useMemo } from "react"
import { Alert, Flex, HStack, Icon, Text } from "@chakra-ui/react"
import { format } from "date-fns"
import { ChatMessage } from "../types/ChatMessage"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { useCurrentUser } from "../hooks/useActors"
import { useHasInventoryPeek } from "../hooks/useHasInventoryPeek"
import { displayNameForUserId } from "../lib/listenerDisplayName"
import { pierceAnonymousSystemContent } from "../lib/pierceAnonymousSystemContent"
import { PIERCE_INDICATOR_ICON } from "../lib/pierceIndicator"
import { getIcon } from "./PluginComponents/icons"

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

  return type === "alert" ? (
    <Alert.Root
      status={status ?? "info"}
      bg="secondaryBg"
      color="secondaryText"
      borderRadius={0}
      data-mention={isMention || undefined}
      css={{
        "&[data-mention]": {
          bg: "primaryBg",
        },
      }}
    >
      <Alert.Indicator />
      {title && <Alert.Title>{title}</Alert.Title>}
      <Alert.Description>
        <HStack gap={1.5} align="center">
          {pierce && meta.maskedUserIds?.length && PierceIcon ? (
            <Icon as={PierceIcon} boxSize={3.5} flexShrink={0} />
          ) : null}
          <ParsedEmojiMessage content={displayContent} />
        </HStack>
      </Alert.Description>
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
      css={{
        "&[data-mention]": {
          bg: "primaryBg",
        },
      }}
      layerStyle="themeTransition"
    >
      <HStack gap={1.5} align="center">
        {pierce && meta.maskedUserIds?.length && PierceIcon ? (
          <Icon as={PierceIcon} boxSize={3.5} flexShrink={0} color="secondaryText" />
        ) : null}
        <Text as="span" color="secondaryText" fontSize="sm" textAlign="center">
          <ParsedEmojiMessage content={displayContent} />
        </Text>
      </HStack>
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
