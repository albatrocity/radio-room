import { useEffect, useRef, useState, useCallback, memo } from "react"
import { Box, Icon, IconButton, HStack, Slider, Container, Text } from "@chakra-ui/react"
import { LuVolume2, LuVolumeX } from "react-icons/lu"
import { RiPlayListFill } from "react-icons/ri"
import Hls from "hls.js"

import ReactionCounter from "./ReactionCounter"
import ButtonAddToLibrary from "./ButtonAddToLibrary"
import ButtonListeners from "./ButtonListeners"
import ButtonAddToQueue from "./ButtonAddToQueue"
import PlayStateIcon from "./PlayStateIcon"
import AdminControls from "./AdminControls"
import {
  useAudioSend,
  useIsAudioLoading,
  useIsAdmin,
  useIsMuted,
  useIsPlaying,
  useVolume,
} from "../hooks/useActors"
import { useHotkeys } from "react-hotkeys-hook"

type Props = {
  trackId: string
  onShowPlaylist: () => void
  hasPlaylist: boolean
  whepUrl?: string
  hlsUrl?: string
}

type Transport = "webrtc" | "hls" | "none"

/** Desktop Safari + iOS browsers (WebKit): native HLS is far more reliable than hls.js + LL-HLS. */
function prefersAppleNativeHls(): boolean {
  if (typeof navigator === "undefined") return false
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true
  const ua = navigator.userAgent
  if (!/Safari/i.test(ua)) return false
  if (/Chrome|Chromium|CriOS|FxiOS|Edg/i.test(ua)) return false
  return true
}

const LivePlayer = ({
  trackId,
  onShowPlaylist,
  hasPlaylist,
  whepUrl,
  hlsUrl,
}: Props) => {
  const audioSend = useAudioSend()
  const playing = useIsPlaying()
  const muted = useIsMuted()
  const volume = useVolume()
  const loading = useIsAudioLoading()
  const isAdmin = useIsAdmin()

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [transport, setTransport] = useState<Transport>("none")
  const hlsFallbackStartedRef = useRef(false)

  const handleVolume = (v: number) => audioSend({ type: "CHANGE_VOLUME", volume: v })
  const handlePlayPause = () => audioSend({ type: "TOGGLE" })
  const handleMute = () => audioSend({ type: "TOGGLE_MUTE" })

  useHotkeys("space", () => handlePlayPause())

  const startHlsFallback = useCallback(() => {
    if (!hlsUrl || !audioRef.current) return
    if (hlsFallbackStartedRef.current) return
    hlsFallbackStartedRef.current = true

    const audio = audioRef.current

    // Critical after failed WebRTC: a lingering MediaStream blocks HLS from producing audible output.
    hlsRef.current?.destroy()
    hlsRef.current = null
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
      // LL-HLS + MSE is flaky on Safari; native path above avoids hls.js there entirely.
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      })
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

    setTransport("hls")
    audioSend({ type: "LOADED" })
    audioSend({ type: "PLAY" })
  }, [hlsUrl, audioSend])

  const startWebRTC = useCallback(async () => {
    if (!whepUrl || !audioRef.current) return

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      })
      pcRef.current = pc

      pc.addTransceiver("audio", { direction: "recvonly" })

      pc.ontrack = (event) => {
        if (audioRef.current && event.streams[0]) {
          audioRef.current.srcObject = event.streams[0]
          audioRef.current.play().catch(() => {})
          audioSend({ type: "LOADED" })
          audioSend({ type: "PLAY" })
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const response = await fetch(whepUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Accept: "application/sdp",
        },
        body: offer.sdp,
      })

      if (!response.ok) {
        throw new Error(`WHEP request failed: ${response.status}`)
      }

      const answerSdp = await response.text()
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })

      setTransport("webrtc")

      const timeout = setTimeout(() => {
        if (pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") {
          console.warn("[LivePlayer] WebRTC ICE timed out, falling back to HLS")
          pc.close()
          pcRef.current = null
          startHlsFallback()
        }
      }, 10000)

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          clearTimeout(timeout)
        }
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          clearTimeout(timeout)
          console.warn("[LivePlayer] WebRTC connection lost, falling back to HLS")
          pc.close()
          pcRef.current = null
          startHlsFallback()
        }
      }
    } catch (err) {
      console.warn("[LivePlayer] WebRTC failed, falling back to HLS:", err)
      startHlsFallback()
    }
  }, [whepUrl, audioSend, startHlsFallback])

  useEffect(() => {
    hlsFallbackStartedRef.current = false

    // Try WHEP first on all browsers (including Safari); production VPS setups often work where
    // Docker/LAN ICE fails. On failure or timeout we fall back to HLS (native on WebKit).
    if (whepUrl) {
      void startWebRTC()
    } else if (hlsUrl) {
      startHlsFallback()
    }

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
      audioSend({ type: "STOP" })
    }
  }, [whepUrl, hlsUrl, startWebRTC, startHlsFallback])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume
    }
  }, [volume, muted])

  useEffect(() => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.play().catch(() => {})
    } else {
      audioRef.current.pause()
    }
  }, [playing])

  return (
    <Box>
      <Box
        display={["none", "flex"]}
        background="actionBg"
        layerStyle="themeTransition"
        alignItems="center"
        py="1"
      >
        <Container>
          <HStack>
            <ButtonAddToLibrary />
            <ReactionCounter
              reactTo={{ type: "track", id: trackId }}
              darkBg={true}
              showAddButton={true}
            />
          </HStack>
        </Container>
      </Box>

      <Box hideFrom="sm" background="actionBg" layerStyle="themeTransition">
        <Box py={1} h={10} overflowX="auto">
          <Box px={4} flexDir="row">
            <HStack alignItems="flex-start">
              <ButtonAddToLibrary />
              <ReactionCounter
                reactTo={{ type: "track", id: trackId }}
                showAddButton={true}
                darkBg={true}
                scrollHorizontal
              />
            </HStack>
          </Box>
        </Box>
      </Box>

      <audio ref={audioRef} style={{ display: "none" }} />

      <Box background="actionBgLite" py={1} layerStyle="themeTransition">
        <Container px={3}>
          <HStack w="100%" direction="row" justify="space-between" align="center">
            <HStack>
              {hasPlaylist && (
                <IconButton
                  size="md"
                  aria-label="Playlist"
                  variant="ghost"
                  onClick={onShowPlaylist}
                >
                  <Icon boxSize={5} as={RiPlayListFill} />
                </IconButton>
              )}
              <IconButton
                size="md"
                aria-label={playing ? "Stop" : "Play"}
                variant="ghost"
                onClick={handlePlayPause}
              >
                <PlayStateIcon loading={loading} playing={playing} />
              </IconButton>
              {!isAdmin && (
                <IconButton
                  size="md"
                  aria-label={muted ? "Unmute" : "Mute"}
                  variant="ghost"
                  onClick={handleMute}
                >
                  {muted ? (
                    <Icon as={LuVolumeX} boxSize={5} />
                  ) : (
                    <Icon as={LuVolume2} boxSize={5} />
                  )}
                </IconButton>
              )}
              {transport !== "none" && (
                <Text fontSize="2xs" color="fg.muted" textTransform="uppercase" userSelect="none">
                  {transport === "webrtc" ? "WebRTC" : "HLS"}
                </Text>
              )}
            </HStack>
            <Box hideBelow="sm" w="100%" pr={3}>
              <Slider.Root
                aria-label={["Volume"]}
                value={[muted ? 0 : volume]}
                max={1.0}
                min={0}
                step={0.1}
                onValueChange={(details) => handleVolume(details.value[0])}
                variant="solid"
                colorPalette="primary"
              >
                <Slider.Control>
                  <Slider.Track bg="whiteAlpha.500">
                    <Slider.Range bg="action.500" />
                  </Slider.Track>
                  <Slider.Thumbs boxSize={3.5} />
                </Slider.Control>
              </Slider.Root>
            </Box>
            <Box hideFrom="sm">
              <HStack>
                {isAdmin && <AdminControls buttonColorScheme="action" buttonVariant="subtle" />}
                <ButtonAddToQueue showText={false} />
                <ButtonListeners variant="ghost" padding={0} />
              </HStack>
            </Box>
          </HStack>
        </Container>
      </Box>
    </Box>
  )
}

export default memo(LivePlayer)
