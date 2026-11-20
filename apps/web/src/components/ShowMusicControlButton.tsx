import { useEffect } from "react"
import { Box, IconButton } from "@chakra-ui/react"
import { LuPause, LuPlay } from "react-icons/lu"
import { useSocketMachine } from "../hooks/useSocketMachine"
import { useQueueList } from "../hooks/useActors"
import { getShowMusicControl } from "../lib/showMusicControl"
import {
  SHOW_MUSIC_CONTROL_EVENT_TYPES,
  showMusicControlMachine,
} from "../machines/showMusicControlMachine"
import { Tooltip } from "./ui/tooltip"

/**
 * Queue-header Play/Pause for app-controlled rooms. Owns socket state for
 * transport, resume eligibility, and toggle pending (ADR 0211).
 */
export default function ShowMusicControlButton() {
  const queue = useQueueList()
  const [state, send] = useSocketMachine(
    showMusicControlMachine,
    undefined,
    [...SHOW_MUSIC_CONTROL_EVENT_TYPES],
  )

  useEffect(() => {
    send({ type: "ACTIVATE" })
    return () => {
      send({ type: "DEACTIVATE" })
    }
  }, [send])

  const view = getShowMusicControl({
    transport: state.context.transport,
    canResume: state.context.canResume,
    queueLength: queue.length,
    pending: state.matches({ active: "pending" }),
  })

  return (
    <Tooltip content={view.tooltip} positioning={{ placement: "top" }}>
      <Box as="span" display="inline-flex">
        <IconButton
          aria-label={view.ariaLabel}
          variant="outline"
          colorPalette="primary"
          size="xs"
          onClick={() => send({ type: "TOGGLE" })}
          loading={state.matches({ active: "pending" })}
          disabled={view.disabled}
        >
          {view.showPauseIcon ? <LuPause /> : <LuPlay />}
        </IconButton>
      </Box>
    </Tooltip>
  )
}
