import { useCallback, type ReactNode } from "react"
import { Box, HStack, Image, Text } from "@chakra-ui/react"
import { CornerUpRight, MoveUp } from "lucide-react"
import type { Poll } from "@repo/types/Poll"
import { openGameStateOnTab } from "../../../actors/modalsActor"
import { useNow } from "../../../hooks/useActors"
import { formatCountdown } from "../../../lib/formatCountdown"
import { useAnimationsEnabled } from "../../../hooks/useReducedMotion"
import { usePluginStoresSelector } from "../../../hooks/usePluginStores"
import { ROAD_SIGN_FONT, roadSignColors } from "../roadSignStyle"
import type { PollTheme, PollThemeHeaderProps } from "../types"
import {
  parseSignDestinationKey,
  signDestinationKey,
  type SignDestination,
} from "./signDestination"

/** Trip tab key (`${pluginName}:${ROAD_TRIP_TAB_ID}`). */
const ROAD_TRIP_TRIP_TAB = "road-trip:trip"

/**
 * Full road-trip store key list. The first `ensurePluginComponentActor` call
 * for a plugin wins for the room, so this must stay in step with `TRIP_STORE_KEYS`.
 */
const ROAD_TRIP_STORE_SPEC = [
  {
    pluginName: "road-trip",
    storeKeys: [
      "tripActive",
      "trip",
      "tripPool",
      "tripPoolOpen",
      "tripProgress",
      "tripEta",
      "tripNextSite",
      "tripFuel",
      "tripWarnings",
    ],
  },
]

function usePollSignDestination(subjectId: string | undefined): SignDestination | null {
  const select = useCallback(
    (stores: Record<string, Record<string, unknown>>) =>
      signDestinationKey(stores["road-trip"], subjectId),
    [subjectId],
  )
  return parseSignDestinationKey(usePluginStoresSelector(ROAD_TRIP_STORE_SPEC, select))
}

function openSignDestination(site: SignDestination): void {
  openGameStateOnTab({
    tabId: ROAD_TRIP_TRIP_TAB,
    frame: {
      kind: "plugin",
      pluginName: "road-trip",
      view: "road-trip-site-detail",
      title: site.name,
      params: { siteId: site.id, tripKey: "trip" },
    },
  })
}

/** First option is the exit by convention; every other option keeps driving. */
function laneIcon(poll: Poll, optionId: string) {
  return poll.options[0]?.id === optionId ? CornerUpRight : MoveUp
}

function RoadTripPollHeader({ poll, actions }: PollThemeHeaderProps) {
  const presentation = poll.presentation
  const colors = roadSignColors(presentation?.variant)
  const exit = presentation?.eyebrow
  const name = presentation?.headline || poll.question
  const destination = usePollSignDestination(presentation?.subjectId)
  const sign = (
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
        {presentation?.body ? (
          <Text
            fontSize="xs"
            fontWeight="medium"
            letterSpacing="normal"
            textTransform="none"
            lineClamp={3}
          >
            {presentation.body}
          </Text>
        ) : null}
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
  )

  return (
    <HStack align="start" gap={2} mb={3}>
      <RoadSign destination={destination} colors={colors}>
        {sign}
      </RoadSign>
      <HStack gap={1}>{actions}</HStack>
    </HStack>
  )
}

function RoadSign({
  destination,
  colors,
  children,
}: {
  destination: SignDestination | null
  colors: { bg: string; fg: string }
  children: ReactNode
}) {
  const shell = {
    flex: 1,
    minW: 0,
    bg: colors.bg,
    color: colors.fg,
    borderRadius: "md",
    p: "3px",
    textAlign: "left" as const,
  }
  if (!destination) return <Box {...shell}>{children}</Box>
  return (
    <Box
      asChild
      {...shell}
      cursor="pointer"
      border="none"
      _hover={{ filter: "brightness(1.08)" }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: colors.fg,
        outlineOffset: "2px",
      }}
    >
      <button
        type="button"
        aria-label={`Open ${destination.name} in the trip`}
        data-sign-destination={destination.id}
        onClick={(event) => {
          event.stopPropagation()
          openSignDestination(destination)
        }}
      >
        {children}
      </button>
    </Box>
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
    const { eyebrow, headline, body } = poll.presentation ?? {}
    const name = body || headline
    if (!name) return poll.question
    return eyebrow ? `${eyebrow} · ${name}` : name
  },
  optionLabel: (_poll, option) => option.label,
  optionIcon: (poll, option) => laneIcon(poll, option.id),
  CloseBar: RoadTripExitBar,
  Footer: RoadTripPollFooter,
}
