import { useCallback, useEffect, useState } from "react"
import { playlistActor } from "../actors/playlistActor"
import { queueListActor } from "../actors/queueListActor"
import {
  buildPlayedTrackIdSet,
  buildQueuedTrackIdSet,
  getTrackRoomPresence,
  type TrackRoomPresence,
} from "../lib/trackRoomPresence"

const EMPTY_PRESENCE: TrackRoomPresence = {
  inQueue: false,
  alreadyPlayed: false,
}

const EMPTY_ID_SET = new Set<string>()

export function useTrackRoomPresence(enabled = true) {
  const [queuedIds, setQueuedIds] = useState<Set<string>>(EMPTY_ID_SET)
  const [playedIds, setPlayedIds] = useState<Set<string>>(EMPTY_ID_SET)

  useEffect(() => {
    if (!enabled) {
      setQueuedIds(EMPTY_ID_SET)
      setPlayedIds(EMPTY_ID_SET)
      return
    }

    const sync = () => {
      setQueuedIds(buildQueuedTrackIdSet(queueListActor.getSnapshot().context.queue))
      setPlayedIds(buildPlayedTrackIdSet(playlistActor.getSnapshot().context.playlist))
    }

    sync()
    const queueSub = queueListActor.subscribe(sync)
    const playlistSub = playlistActor.subscribe(sync)

    return () => {
      queueSub.unsubscribe()
      playlistSub.unsubscribe()
    }
  }, [enabled])

  const getPresence = useCallback(
    (trackId: string): TrackRoomPresence => {
      if (!enabled || !trackId) {
        return EMPTY_PRESENCE
      }
      return getTrackRoomPresence(trackId, queuedIds, playedIds)
    },
    [enabled, queuedIds, playedIds],
  )

  return { getPresence }
}

export type GetTrackPresence = (trackId: string) => TrackRoomPresence
