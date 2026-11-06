import { Box, Icon, Text } from "@chakra-ui/react"
import { ClassNames, css, keyframes } from "@emotion/react"
import { Split, Van } from "lucide-react"
import type { TripStore } from "@repo/road-trip-map"
import { useAnimationsEnabled } from "../../../../hooks/useReducedMotion"
import { VAN_FLOURISH_MS, type VanFlourish } from "../../../../machines/roadTripVanMotionMachine"
import { junctionLabel, siteLabel, sitePin } from "./tripView"
import type { VanMotion } from "./useRoadTripVanMotion"

type Props = {
  trip: TripStore
  mile: number
  /** Pixel height of the line row; pins scale with it. */
  size?: "sm" | "md"
  motion?: VanMotion
}

// The wrapper centers the van on its mile. These only scale and rotate, so a
// flourish and the cruise chug can share that anchor.
// Wheelie: tip back on the rear wheel while growing, hang there, then slam down and squash.
const kfDepart = keyframes`
  0% { transform: rotate(0deg) scale(1); }
  30% { transform: rotate(-14deg) scale(1.3); }
  55% { transform: rotate(-16deg) scale(1.3); }
  70% { transform: rotate(2deg) scale(1.1, 0.88); }
  82% { transform: rotate(0deg) scale(0.96, 1.05); }
  100% { transform: rotate(0deg) scale(1); }
`

const kfPark = keyframes`
  0% { transform: scale(1, 1); }
  30% { transform: scale(1.3, 0.75); }
  45% { transform: scale(0.82, 1.18); }
  60% { transform: scale(1.12, 0.9); }
  75% { transform: scale(0.96, 1.04); }
  100% { transform: scale(1, 1); }
`

const kfHold = keyframes`
  0% { transform: scale(1, 1); }
  40% { transform: scale(1.18, 0.85); }
  70% { transform: scale(0.94, 1.06); }
  100% { transform: scale(1, 1); }
`

// Steamboat Willie: squat into the wheels at each end of the rock, rise through center.
const kfChug = keyframes`
  0%, 100% { transform: rotate(0deg) scale(0.988, 1.016); }
  25% { transform: translateY(0.4px) rotate(-4deg) scale(1.04, 0.904); }
  50% { transform: rotate(0deg) scale(0.988, 1.016); }
  75% { transform: translateY(0.4px) rotate(4deg) scale(1.04, 0.904); }
`

const CHUG_MS = 1680

const CHUG_ANIM = css`
  animation: ${kfChug} ${CHUG_MS}ms ease-in-out infinite;
  transform-origin: 50% 82%;
`

// Same function list in both poses so the heading eases instead of popping.
// Exiting turns the van off the route. The chug then plays in that space.
const LEVEL_POSE = "translate(-50%, -50%) perspective(52px) rotateY(0deg) rotate(0deg)"
const EXIT_POSE = "translate(-50%, -50%) perspective(52px) rotateY(-34deg) rotate(-12deg)"

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

/**
 * Route line: travelled solid, remaining dashed, icon pins, `?` for unrevealed
 * sites, forks whose vote has opened (ADR 0222), and the van riding it.
 */
export function TripRouteLine({ trip, mile, size = "sm", motion }: Props) {
  const animationsEnabled = useAnimationsEnabled()
  const pct = (value: number) =>
    trip.routeMiles > 0 ? Math.min(100, Math.max(0, (value / trip.routeMiles) * 100)) : 0
  const vanPct = pct(mile)
  const pinSize = size === "md" ? "md" : "xs"
  const flourish = animationsEnabled ? motion?.flourish : null
  const phase = motion?.phase
  const exiting = phase === "exiting"
  const chugging = animationsEnabled && !flourish && (phase === "cruising" || exiting)

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
      {(trip.junctions ?? []).map((junction) => (
        <Icon
          key={`fork:${junction.routeId}`}
          as={Split}
          position="absolute"
          top="50%"
          left={`${pct(junction.mile)}%`}
          transform="translate(-50%, -50%) rotate(90deg)"
          boxSize={size === "md" ? "16px" : "13px"}
          p="1px"
          bg="bg"
          borderRadius="full"
          color={
            junction.state === "take"
              ? "action.solid"
              : junction.state === "polling"
                ? "orange.solid"
                : "fg.muted"
          }
          opacity={junction.state === "stay" ? 0.5 : 1}
          data-road-trip-junction={junction.state}
        >
          <title>{junctionLabel(junction)}</title>
        </Icon>
      ))}
      <ClassNames>
        {({ css: emotionCss }) => {
          const anim = flourish ? FLOURISH_ANIM[flourish] : chugging ? CHUG_ANIM : null
          return (
            <Box
              position="absolute"
              top="50%"
              left={`${vanPct}%`}
              display="flex"
              lineHeight={0}
              transform={exiting ? EXIT_POSE : LEVEL_POSE}
              transition={
                animationsEnabled ? "left 1s linear, transform 0.55s ease-out" : "none"
              }
              zIndex={1}
              data-road-trip-van
              data-van-flourish={flourish ?? undefined}
              data-van-heading={exiting ? "exit" : undefined}
            >
              <Icon
                // A new id remounts the icon so the same flourish can replay.
                key={motion?.flourishId ?? 0}
                as={Van}
                className={anim ? emotionCss(anim) : undefined}
                display="block"
                boxSize={size === "md" ? "26px" : "22px"}
                p="1px"
                bg="bg"
                borderRadius="sm"
                boxShadow="0 0 6px 4px var(--chakra-colors-bg)"
                color={{ base: "action.solid", _dark: "action.contrast" }}
                data-van-gait={chugging ? "chug" : undefined}
              />
            </Box>
          )
        }}
      </ClassNames>
    </Box>
  )
}
