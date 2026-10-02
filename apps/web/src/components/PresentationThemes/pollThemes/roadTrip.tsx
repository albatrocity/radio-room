import { Box, HStack, Image, Text } from "@chakra-ui/react"
import type { Poll } from "@repo/types/Poll"
import { useNow } from "../../../hooks/useActors"
import { formatCountdown } from "../../../lib/formatCountdown"
import { useAnimationsEnabled } from "../../../hooks/useReducedMotion"
import { ROAD_SIGN_FONT, roadSignColors } from "../roadSignStyle"
import type { PollTheme, PollThemeHeaderProps } from "../types"

const EXIT_ARROW = "⬈"
const STRAIGHT_ARROW = "⬆"

/** First option is the exit by convention; every other option keeps driving. */
function laneArrow(poll: Poll, optionId: string): string {
  return poll.options[0]?.id === optionId ? EXIT_ARROW : STRAIGHT_ARROW
}

function RoadTripPollHeader({ poll, actions }: PollThemeHeaderProps) {
  const presentation = poll.presentation
  const colors = roadSignColors(presentation?.variant)
  const exit = presentation?.eyebrow
  const name = presentation?.headline || poll.question

  return (
    <HStack align="start" gap={2} mb={3}>
      <Box flex={1} minW={0} bg={colors.bg} color={colors.fg} borderRadius="md" p="3px">
        <HStack
          gap={2}
          px={2.5}
          py={1.5}
          borderRadius="sm"
          borderWidth="1.5px"
          borderColor={colors.rule}
          align="center"
        >
          {presentation?.icon ? (
            <Text as="span" fontSize="xl" lineHeight={1} flexShrink={0} aria-hidden>
              {presentation.icon}
            </Text>
          ) : null}
          <Box flex={1} minW={0} fontFamily={ROAD_SIGN_FONT} lineHeight="short">
            {exit ? (
              <Text fontSize="xs" fontWeight="bold" letterSpacing="0.06em">
                {exit}
              </Text>
            ) : null}
            <Text
              fontSize="md"
              fontWeight="bold"
              letterSpacing="0.04em"
              textTransform="uppercase"
              lineClamp={2}
            >
              {name}
            </Text>
          </Box>
          {presentation?.imageUrl ? (
            <Image
              src={presentation.imageUrl}
              alt=""
              boxSize="40px"
              objectFit="cover"
              borderRadius="sm"
              flexShrink={0}
            />
          ) : null}
        </HStack>
      </Box>
      <HStack gap={1}>{actions}</HStack>
    </HStack>
  )
}

/** GPS-style turn bar over the poll's `closesAt` (ticks once a second; no tween under reduced motion). */
function RoadTripExitBar({ poll, endAt }: { poll: Poll; endAt: number }) {
  const now = useNow()
  const animationsEnabled = useAnimationsEnabled()
  const startAt = poll.publishedAt
  const span = Math.max(1, endAt - startAt)
  const remaining = Math.max(0, endAt - now)
  const pct = Math.min(100, (remaining / span) * 100)

  return (
    <HStack px={4} pb={2} gap={2} align="center" aria-live="off">
      <Text fontSize="xs" fontWeight="semibold" flexShrink={0} fontFamily={ROAD_SIGN_FONT}>
        🧭 Exit in {formatCountdown(remaining)}
      </Text>
      <Box flex={1} h="4px" borderRadius="full" bg="bg.muted" overflow="hidden">
        <Box
          h="full"
          w={`${pct}%`}
          bg={roadSignColors(poll.presentation?.variant).bg}
          transition={animationsEnabled ? "width 1s linear" : "none"}
        />
      </Box>
    </HStack>
  )
}

function RoadTripPollFooter({ poll }: { poll: Poll }) {
  if (!poll.presentation?.footnote) return null
  return (
    <Text px={4} pb={3} fontSize="xs" color="fg.muted">
      {poll.presentation.footnote}
    </Text>
  )
}

export const roadTripPollTheme: PollTheme = {
  Header: RoadTripPollHeader,
  collapsedLabel: (poll) => {
    const { eyebrow, headline } = poll.presentation ?? {}
    if (!headline) return poll.question
    return eyebrow ? `${eyebrow} · ${headline}` : headline
  },
  optionLabel: (poll, option) => `${laneArrow(poll, option.id)}  ${option.label}`,
  CloseBar: RoadTripExitBar,
  Footer: RoadTripPollFooter,
}
