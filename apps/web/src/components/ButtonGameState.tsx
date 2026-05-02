import { Box, Icon, IconButton, Status } from "@chakra-ui/react"
import { LuGamepad2 } from "react-icons/lu"
import {
  useActiveGameSessionName,
  useHasActiveGameSession,
  useModalsSend,
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
    </Box>
  )
}

export default ButtonGameState
