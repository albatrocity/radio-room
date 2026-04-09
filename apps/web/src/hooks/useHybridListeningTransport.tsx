import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  const [listeningTransport, setListeningTransport] =
    useState<ListeningAudioTransport>("shoutcast")

  useEffect(() => {
    if (!room?.id) return
    if (!isHybrid) {
      setListeningTransport("shoutcast")
      return
    }
    const raw = localStorage.getItem(transportStorageKey(room.id))
    setListeningTransport(raw === "webrtc" ? "webrtc" : "shoutcast")
  }, [room?.id, isHybrid])

  useEffect(() => {
    if (!isHybrid || !room?.liveIngestEnabled) {
      setListeningTransport("shoutcast")
    }
  }, [isHybrid, room?.liveIngestEnabled])

  useEffect(() => {
    setListeningAudioTransportPreference(listeningTransport)
    if (participation === "listening") {
      emitToSocket("SET_LISTENING_AUDIO_TRANSPORT", { audioTransport: listeningTransport })
    }
  }, [listeningTransport, participation])

  const persistTransport = useCallback(
    (t: ListeningAudioTransport) => {
      if (t !== listeningTransport) {
        // Reset playback before React swaps LivePlayer ↔ RadioControls. Otherwise the new
        // player can mount while the machine is still "playing" from the old transport, and
        // STOP/cleanup from the old player only runs after paint (effects), which breaks
        // Shoutcast/Howler after WebRTC.
        audioActor.send({ type: "STOP" })
      }
      setListeningTransport(t)
      if (room?.id) localStorage.setItem(transportStorageKey(room.id), t)
    },
    [room?.id, listeningTransport],
  )

  const value = useMemo(
    () => ({
      listeningTransport,
      persistTransport,
      isHybrid,
      hybridReady,
      webrtcExperimentalStatus,
    }),
    [listeningTransport, persistTransport, isHybrid, hybridReady, webrtcExperimentalStatus],
  )

  return (
    <HybridListeningTransportContext.Provider value={value}>
      {children}
    </HybridListeningTransportContext.Provider>
  )
}

/**
 * Hybrid radio: Shoutcast vs experimental WebRTC listen path — persisted per room and
 * synced to the server when the user is in the listening participation bucket.
 */
export function useHybridListeningTransport() {
  const ctx = useContext(HybridListeningTransportContext)
  if (!ctx) {
    throw new Error(
      "useHybridListeningTransport must be used within HybridListeningTransportProvider",
    )
  }
  return ctx
}
