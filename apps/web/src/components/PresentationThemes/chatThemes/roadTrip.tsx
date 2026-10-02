import { Box, HStack, Text } from "@chakra-ui/react"
import ParsedEmojiMessage from "../../ParsedEmojiMessage"
import { ROAD_SIGN_FONT, roadSignColors } from "../roadSignStyle"
import type { ChatThemeMessageProps } from "../types"

/** Compact road sign in chat: one headline, one body line (ADR 0203). */
export function RoadTripSignMessage({ title, content, status, icon, time }: ChatThemeMessageProps) {
  const colors = roadSignColors(status)
  const headline = title?.trim() || content
  const body = title?.trim() ? content : null

  return (
    <Box px={3} py={1.5} role="group" data-road-sign={status ?? "info"}>
      <Box bg={colors.bg} color={colors.fg} borderRadius="md" p="3px" shadow="xs">
        <HStack
          gap={2}
          px={2.5}
          py={1.5}
          borderRadius="sm"
          borderWidth="1.5px"
          borderColor={colors.rule}
          align="center"
        >
          {icon ? (
            <Text as="span" fontSize="lg" lineHeight={1} flexShrink={0} aria-hidden>
              {icon}
            </Text>
          ) : null}
          <Box minW={0} flex={1}>
            <Text
              fontFamily={ROAD_SIGN_FONT}
              fontWeight="bold"
              fontSize="sm"
              letterSpacing="0.04em"
              textTransform="uppercase"
              lineHeight="short"
              truncate
            >
              {headline}
            </Text>
            {body ? (
              <Text fontSize="xs" lineHeight="short" opacity={0.95} lineClamp={1}>
                <ParsedEmojiMessage content={body} />
              </Text>
            ) : null}
          </Box>
          <Text
            fontSize="2xs"
            opacity={0}
            _groupHover={{ opacity: 0.8 }}
            flexShrink={0}
            aria-label={`Sent ${time}`}
          >
            {time}
          </Text>
        </HStack>
      </Box>
    </Box>
  )
}
