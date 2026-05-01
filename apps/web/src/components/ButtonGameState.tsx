import { Icon, IconButton } from "@chakra-ui/react"
import { LuTrophy } from "react-icons/lu"
import {
  useActiveGameSessionName,
  useHasActiveGameSession,
  useModalsSend,
} from "../hooks/useActors"

/**
 * Opens the user's game state modal. Hidden when no game session is running
 * for the current room.
 */
function ButtonGameState() {
  const modalSend = useModalsSend()
  const hasActiveSession = useHasActiveGameSession()
  const sessionName = useActiveGameSessionName()

  if (!hasActiveSession) return null

  const label = sessionName ? `Game stats — ${sessionName}` : "Game stats"

  return (
    <IconButton
      aria-label={label}
      title={label}
      variant="ghost"
      colorPalette="action"
      onClick={() => modalSend({ type: "VIEW_GAME_STATE" })}
    >
      <Icon as={LuTrophy} />
    </IconButton>
  )
}

export default ButtonGameState
