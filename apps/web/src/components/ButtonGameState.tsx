import { useCallback, useEffect, useMemo, useRef } from "react"
import { Box, Icon, IconButton, Status } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import { CircleDollarSign } from "lucide-react"
import { LuGamepad2 } from "react-icons/lu"
import { useAnimeScope } from "../animations/useAnimeScope"
import { useCoinFeedbackButtonAnimation } from "../animations/useCoinFeedbackButtonAnimation"
import {
  useActiveGameSessionName,
  useHasActiveGameSession,
  useModalsSend,
  useUserGameSession,
  useUserState,
} from "../hooks/useActors"
import { useAnimationsEnabled } from "../hooks/useReducedMotion"
import { coinGainFeedbackMachine } from "../machines/coinGainFeedbackMachine"
import { useGameStateNewPluginTabs } from "./GameStateNewPluginTabsProvider"

/**
 * Opens the user's game state modal. Hidden when no game session is running
 * for the current room.
 */
function ButtonGameState() {
  const modalSend = useModalsSend()
  const hasActiveSession = useHasActiveGameSession()
  const sessionName = useActiveGameSessionName()
  const session = useUserGameSession()
  const { hasUnseenPluginTabs } = useGameStateNewPluginTabs()
  const userState = useUserState()
  const modifiers = userState?.modifiers
  const animationsEnabled = useAnimationsEnabled()

  const [coinFeedbackState, sendCoinFeedback] = useMachine(coinGainFeedbackMachine)

  const scopeRootRef = useRef<HTMLDivElement>(null)
  const coinMotionRef = useRef<HTMLDivElement>(null)
  const buttonMotionRef = useRef<HTMLDivElement>(null)

  const coin = userState?.attributes.coin ?? 0
  const coinAttributeEnabled = session?.config.enabledAttributes.includes("coin") ?? false

  useEffect(() => {
    sendCoinFeedback({
      type: "SYNC",
      coin,
      coinAttributeEnabled,
      sessionActive: hasActiveSession,
      animationsEnabled,
    })
  }, [coin, coinAttributeEnabled, hasActiveSession, animationsEnabled, sendCoinFeedback])

  useAnimeScope(scopeRootRef, hasActiveSession)

  const animating = coinFeedbackState.matches("animating")
  const coinAnimationKind = coinFeedbackState.context.animationKind

  const onCoinFeedbackAnimationFinished = useCallback(() => {
    sendCoinFeedback({ type: "ANIMATION_FINISHED" })
  }, [sendCoinFeedback])

  useCoinFeedbackButtonAnimation(
    animating,
    coinAnimationKind,
    coinMotionRef,
    buttonMotionRef,
    onCoinFeedbackAnimationFinished,
  )

  const { hasPositive, hasNegative } = useMemo(() => {
    const now = Date.now()
    let pos = false
    let neg = false
    for (const m of modifiers ?? []) {
      if (m.startAt > now || m.endAt <= now) continue
      for (const effect of m.effects) {
        if (effect.intent === "positive") pos = true
        else if (effect.intent === "negative") neg = true
        if (pos && neg) break
      }
      if (pos && neg) break
    }
    return { hasPositive: pos, hasNegative: neg }
  }, [modifiers])

  if (!hasActiveSession) return null

  const label = sessionName ? `Game stats — ${sessionName}` : "Game stats"

  return (
    <Box position="relative" display="inline-flex">
      <Box ref={scopeRootRef} position="relative" display="inline-flex">
        {coinAttributeEnabled ? (
          <Box
            position="absolute"
            inset="0"
            display="flex"
            alignItems="center"
            justifyContent="center"
            pointerEvents="none"
            zIndex={2}
          >
            <Box
              ref={coinMotionRef}
              opacity={0}
              h="1.35em"
              w="1.35em"
              bg="gold"
              borderRadius="full"
            >
              <Icon as={CircleDollarSign} color="black/30" />
            </Box>
          </Box>
        ) : null}
        <Box ref={buttonMotionRef} display="inline-flex" style={{ transformOrigin: "center" }}>
          <IconButton
            aria-label={label}
            title={label}
            variant="ghost"
            colorPalette="action"
            onClick={() => modalSend({ type: "VIEW_GAME_STATE" })}
          >
            <Icon as={LuGamepad2} />
          </IconButton>
        </Box>
      </Box>
      {hasUnseenPluginTabs ? (
        <Status.Root
          size="sm"
          colorPalette="primary"
          position="absolute"
          top="1"
          right="1"
          pointerEvents="none"
        >
          <Status.Indicator />
        </Status.Root>
      ) : null}
      {hasNegative ? (
        <Status.Root
          size="sm"
          colorPalette="red"
          position="absolute"
          top="1"
          left="1"
          pointerEvents="none"
        >
          <Status.Indicator />
        </Status.Root>
      ) : null}
      {hasPositive ? (
        <Status.Root
          size="sm"
          colorPalette="green"
          position="absolute"
          top="2"
          left="1"
          pointerEvents="none"
        >
          <Status.Indicator />
        </Status.Root>
      ) : null}
    </Box>
  )
}

export default ButtonGameState
