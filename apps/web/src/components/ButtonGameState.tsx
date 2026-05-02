import { useMemo } from "react"
import { Box, Icon, IconButton, Status } from "@chakra-ui/react"
import { LuGamepad2 } from "react-icons/lu"
import {
  useActiveGameSessionName,
  useHasActiveGameSession,
  useModalsSend,
  useUserState,
} from "../hooks/useActors"
import { useGameStateNewPluginTabs } from "./GameStateNewPluginTabsProvider"

/**
 * Opens the user's game state modal. Hidden when no game session is running
 * for the current room.
 */
function ButtonGameState() {
  const modalSend = useModalsSend()
  const hasActiveSession = useHasActiveGameSession()
  const sessionName = useActiveGameSessionName()
  const { hasUnseenPluginTabs } = useGameStateNewPluginTabs()
  const userState = useUserState()
  const modifiers = userState?.modifiers

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
      <IconButton
        aria-label={label}
        title={label}
        variant="ghost"
        colorPalette="action"
        onClick={() => modalSend({ type: "VIEW_GAME_STATE" })}
      >
        <Icon as={LuGamepad2} />
      </IconButton>
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
