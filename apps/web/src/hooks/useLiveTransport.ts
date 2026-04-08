import { useEffect, useRef } from "react"
import { useMachine } from "@xstate/react"
import Hls from "hls.js"
import { liveTransportMachine, type LiveTransportEvent } from "../machines/liveTransportMachine"

function prefersAppleNativeHls(): boolean {
  if (typeof navigator === "undefined") return false
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true
  const ua = navigator.userAgent
  if (!/Safari/i.test(ua)) return false
  if (/Chrome|Chromium|CriOS|FxiOS|Edg/i.test(ua)) return false
  return true
}

const ICE_EVENT_MAP: Record<string, LiveTransportEvent["type"]> = {
  connected: "ICE_CONNECTED",
  completed: "ICE_COMPLETED",
  disconnected: "ICE_DISCONNECTED",
  failed: "ICE_FAILED",
}

export function useLiveTransport(
  whepUrl: string | undefined,
  hlsUrl: string | undefined,
  audioSend: (event: { type: "LOADED" } | { type: "PLAY" } | { type: "STOP" }) => void,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const audioSendRef = useRef(audioSend)
  audioSendRef.current = audioSend

  const [state, send] = useMachine(liveTransportMachine, {
    input: { hasWhepUrl: !!whepUrl },
  })

  const isInWebrtc = state.matches("webrtc")
  const isInHls = state.matches("hls")
  const isWebrtcPlaying = state.matches({ webrtc: "playing" })

  // Signal the audio actor once WebRTC is confirmed active (ICE connected, track ready).
  useEffect(() => {
    if (isWebrtcPlaying) {
      audioSendRef.current({ type: "LOADED" })
    }
  }, [isWebrtcPlaying])

  // WebRTC lifecycle — runs once when entering the "webrtc" compound state,
  // cleans up when leaving it (transition to "hls").
  useEffect(() => {
    if (!isInWebrtc || !whepUrl || !audioRef.current) return

    const audio = audioRef.current
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })
    pcRef.current = pc

    pc.addTransceiver("audio", { direction: "recvonly" })

    pc.ontrack = (event) => {
      console.log("[webrtc] ontrack fired:", event.track.kind, "readyState:", event.track.readyState, "streams:", event.streams.length)
      if (!audio) return
      const stream = event.streams[0] ?? new MediaStream([event.track])
      audio.srcObject = stream
      send({ type: "TRACK_RECEIVED" })
    }

    pc.oniceconnectionstatechange = () => {
      const mapped = ICE_EVENT_MAP[pc.iceConnectionState]
      if (mapped) send({ type: mapped })
    }

    ;(async () => {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const response = await fetch(whepUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp", Accept: "application/sdp" },
          body: offer.sdp,
        })
        if (!response.ok) throw new Error(`WHEP ${response.status}`)

        const answerSdp = await response.text()
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })
        send({ type: "WHEP_OK" })
      } catch (err) {
        console.warn("[webrtc] WHEP failed:", err)
        send({ type: "WHEP_FAILED" })
      }
    })()

    return () => {
      pc.ontrack = null
      pc.oniceconnectionstatechange = null
      pc.close()
      pcRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInWebrtc, whepUrl])

  // HLS lifecycle — runs when the machine settles in "hls".
  useEffect(() => {
    if (!isInHls || !hlsUrl || !audioRef.current) return

    // Clear any lingering WebRTC media from the element
    const audio = audioRef.current
    audio.pause()
    audio.srcObject = null
    audio.removeAttribute("src")
    audio.load()

    const canNative = !!audio.canPlayType?.("application/vnd.apple.mpegurl")
    const useNative = canNative && prefersAppleNativeHls()

    if (useNative) {
      audio.src = hlsUrl
      audio.play().catch(() => {})
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hls.loadSource(hlsUrl)
      hls.attachMedia(audio)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio.play().catch(() => {})
      })
      hlsRef.current = hls
    } else if (canNative) {
      audio.src = hlsUrl
      audio.play().catch(() => {})
    }

    audioSendRef.current({ type: "LOADED" })
    audioSendRef.current({ type: "PLAY" })

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInHls, hlsUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pcRef.current?.close()
      pcRef.current = null
      hlsRef.current?.destroy()
      hlsRef.current = null
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.srcObject = null
        audio.removeAttribute("src")
        audio.load()
      }
      audioSendRef.current({ type: "STOP" })
    }
  }, [])

  return { transport: state.context.transport, audioRef }
}
