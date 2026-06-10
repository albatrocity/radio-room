import { useCallback, useState } from "react"
import {
  getPollDisplayMode,
  setPollDisplayMode,
  type PollDisplayMode,
} from "../lib/pollDisplayPreference"

export function usePollDisplayMode(roomId: string | undefined, pollId: string | undefined) {
  const [mode, setModeState] = useState<PollDisplayMode>(() => {
    if (!roomId || !pollId) return "expanded"
    return getPollDisplayMode(roomId, pollId)
  })

  const setMode = useCallback(
    (next: PollDisplayMode) => {
      if (!roomId || !pollId) return
      setPollDisplayMode(roomId, pollId, next)
      setModeState(next)
    },
    [roomId, pollId],
  )

  return { mode, setMode }
}
