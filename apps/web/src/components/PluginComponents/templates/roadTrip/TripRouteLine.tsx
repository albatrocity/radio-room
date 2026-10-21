import { Box, Icon, Text } from "@chakra-ui/react"
import { ClassNames, css, keyframes } from "@emotion/react"
import { Van } from "lucide-react"
import type { TripStore } from "@repo/road-trip-map"
import { useAnimationsEnabled } from "../../../../hooks/useReducedMotion"
import { VAN_FLOURISH_MS, type VanFlourish } from "../../../../machines/roadTripVanMotionMachine"
import { siteLabel, sitePin } from "./tripView"
import type { VanMotion } from "./useRoadTripVanMotion"

type Props = {
  trip: TripStore
  mile: number
  /** Pixel height of the line row; pins scale with it. */
  size?: "sm" | "md"
  motion?: VanMotion
}

// Every frame keeps the centering translate so the van doesn't jump off its mile.
// Wheelie: tip back on the rear wheel while growing, hang there, then slam down and squash.
const kfDepart = keyframes`
  0% { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
  30% { transform: translate(-50%, -50%) rotate(-14deg) scale(1.3); }
  55% { transform: translate(-50%, -50%) rotate(-16deg) scale(1.3); }
  70% { transform: translate(-50%, -50%) rotate(2deg) scale(1.1, 0.88); }
  82% { transform: translate(-50%, -50%) rotate(0deg) scale(0.96, 1.05); }
  100% { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
`

const kfPark = keyframes`
  0% { transform: translate(-50%, -50%) scale(1, 1); }
  30% { transform: translate(-50%, -50%) scale(1.3, 0.75); }
  45% { transform: translate(-50%, -50%) scale(0.82, 1.18); }
  60% { transform: translate(-50%, -50%) scale(1.12, 0.9); }
  75% { transform: translate(-50%, -50%) scale(0.96, 1.04); }
  100% { transform: translate(-50%, -50%) scale(1, 1); }
`

const kfHold = keyframes`
  0% { transform: translate(-50%, -50%) scale(1, 1); }
  40% { transform: translate(-50%, -50%) scale(1.18, 0.85); }
  70% { transform: translate(-50%, -50%) scale(0.94, 1.06); }
  100% { transform: translate(-50%, -50%) scale(1, 1); }
`

const FLOURISH_ANIM: Record<VanFlourish, ReturnType<typeof css>> = {
  depart: css`
    animation: ${kfDepart} ${VAN_FLOURISH_MS.depart}ms ease-in-out;
    transform-origin: 30% 80%;
  `,
  park: css`
    animation: ${kfPark} ${VAN_FLOURISH_MS.park}ms ease-out;
  `,
  hold: css`
    animation: ${kfHold} ${VAN_FLOURISH_MS.hold}ms ease-out;
  `,
}

/** Route line: travelled solid, remaining dashed, icon pins, `?` for unrevealed sites, and the van riding it. */
export function TripRouteLine({ trip, mile, size = "sm", motion }: Props) {
  const animationsEnabled = useAnimationsEnabled()
  const pct = (value: number) =>
    trip.routeMiles > 0 ? Math.min(100, Math.max(0, (value / trip.routeMiles) * 100)) : 0
  const vanPct = pct(mile)
  const pinSize = size === "md" ? "md" : "xs"
  const flourish = animationsEnabled ? motion?.flourish : null

  return (
    <Box position="relative" h="28px" flex="1 0 auto" minW="80px" aria-hidden>
      <Box
        position="absolute"
        top="50%"
        left={0}
        right={0}
        borderTopWidth="2px"
        borderTopStyle="dashed"
        borderColor="fg.muted"
        opacity={0.6}
      />
      <Box
        position="absolute"
        top="50%"
        left={0}
        w={`${vanPct}%`}
        borderTopWidth="2px"
        borderColor="action.solid"
        transition={animationsEnabled ? "width 1s linear" : "none"}
      />
      {trip.sites.map((site) => (
        <Text
          key={site.id}
          as="span"
          position="absolute"
          top="50%"
          left={`${pct(site.mile)}%`}
          transform="translate(-50%, -50%)"
          fontSize={pinSize}
          lineHeight={1}
          bg="bg"
          borderRadius="full"
          px="1px"
          opacity={site.state === "skipped" ? 0.45 : 1}
          title={siteLabel(site)}
          fontWeight={site.state === "unrevealed" ? "bold" : undefined}
          color={site.state === "unrevealed" ? "fg.muted" : undefined}
        >
          {sitePin(site)}
        </Text>
      ))}
      <ClassNames>
        {({ css: emotionCss }) => (
          <Icon
            // A new id remounts the icon so the same flourish can replay.
            key={motion?.flourishId ?? 0}
            as={Van}
            className={flourish ? emotionCss(FLOURISH_ANIM[flourish]) : undefined}
            position="absolute"
            top="50%"
            left={`${vanPct}%`}
            transform="translate(-50%, -50%)"
            boxSize={size === "md" ? "26px" : "22px"}
            p="1px"
            bg="bg"
            borderRadius="sm"
            boxShadow="0 0 6px 4px var(--chakra-colors-bg)"
            color={{ base: "action.solid", _dark: "action.contrast" }}
            transition={animationsEnabled ? "left 1s linear" : "none"}
            zIndex={1}
            data-road-trip-van
            data-van-flourish={flourish ?? undefined}
          />
        )}
      </ClassNames>
    </Box>
  )
}
