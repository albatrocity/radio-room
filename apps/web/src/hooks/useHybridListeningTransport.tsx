import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useSelector } from "@xstate/react"

import { audioActor } from "../actors/audioActor"
import { emitToSocket } from "../actors/socketActor"
import {
  setListeningAudioTransportPreference,
  type ListeningAudioTransport,
} from "../lib/listeningAudioTransportPreference"
import { isHybridRadioRoom } from "../lib/roomTypeHelpers"
import { useCurrentRoom, useParticipationStatus } from "./useActors"

function transportStorageKey(roomId: string) {
  return `listening-room-${roomId}:audioTransport`
}

export type HybridListeningTransportContextValue = {
  /** Effective path: Shoutcast whenever hybrid ingest is off, else user preference. */
  listeningTransport: ListeningAudioTransport
  persistTransport: (t: ListeningAudioTransport) => void
  isHybrid: boolean
  hybridReady: boolean
  webrtcExperimentalStatus: "online" | "offline" | "unknown"
}

const HybridListeningTransportContext =
  createContext<HybridListeningTransportContextValue | null>(null)

/**
 * Single shared state for hybrid radio listen transport (Shoutcast vs WebRTC).
 * Must wrap the room layout so PlayerUi and PopoverPreferences see the same value.
 *
 * When `liveIngestEnabled` is turned off, **listening transport** is derived as Shoutcast
 * immediately (see `listeningTransportEffective`); `audioActor` STOP is sent from
 * `roomFetchMachine` on `ROOM_SETTINGS_UPDATED` / `ROOM_DATA` so playback state stays in sync
 * before React paints Shoutcast controls.
 */
export function HybridListeningTransportProvider({ children }: { children: ReactNode }) {
  const room = useCurrentRoom()
  const participation = useParticipationStatus()
  const webrtcExperimentalStatus = useSelector(
    audioActor,
    (s) => s.context.webrtcExperimentalStreamStatus,
  )

  const isHybrid = !!(room && isHybridRadioRoom(room))
  const hybridReady = !!(room?.liveWhepUrl && room?.liveHlsUrl)

  const [listeningTransportPreference, setListeningTransportPreference] =
    useState<ListeningAudioTransport>("shoutcast")

  const listeningTransportEffective = useMemo((): ListeningAudioTransport => {
    if (!room || !isHybridRadioRoom(room)) {
      return "shoutcast"
    }
    return listeningTransportPreference
  }, [room, listeningTransportPreference])

  useLayoutEffect(() => {
    if (!room?.id || !isHybrid) return
    const raw = localStorage.getItem(transportStorageKey(room.id))
    setListeningTransportPreference(raw === "webrtc" ? "webrtc" : "shoutcast")
  }, [room?.id, isHybrid])

  useEffect(() => {
    setListeningAudioTransportPreference(listeningTransportEffective)
    if (participation === "listening") {
      emitToSocket("SET_LISTENING_AUDIO_TRANSPORT", {
        audioTransport: listeningTransportEffective,
      })
    }
  }, [listeningTransportEffective, participation])

  const persistTransport = useCallback(
    (t: ListeningAudioTransport) => {
      if (!room?.id || !isHybrid) return
      if (t !== listeningTransportPreference) {
        audioActor.send({ type: "STOP" })
      }
      setListeningTransportPreference(t)
      localStorage.setItem(transportStorageKey(room.id), t)
    },
    [room?.id, isHybrid, listeningTransportPreference],
  )

  const value = useMemo(
    () => ({
      listeningTransport: listeningTransportEffective,
      persistTransport,
      isHybrid,
      hybridReady,
      webrtcExperimentalStatus,
    }),
    [
      listeningTransportEffective,
      persistTransport,
      isHybrid,
      hybridReady,
      webrtcExperimentalStatus,
    ],
  )

  return (
    <HybridListeningTransportContext.Provider value={value}>
      {children}
    </HybridListeningTransportContext.Provider>
  )
}

export function useHybridListeningTransport() {
  const ctx = useContext(HybridListeningTransportContext)
  if (!ctx) {
    throw new Error(
      "useHybridListeningTransport must be used within HybridListeningTransportProvider",
    )
  }
  return ctx
}
