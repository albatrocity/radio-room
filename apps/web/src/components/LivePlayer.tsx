import { useEffect, memo } from "react"
import { Box, Icon, IconButton, HStack, Slider, Container } from "@chakra-ui/react"
import { LuVolume2, LuVolumeX } from "react-icons/lu"
import { RiPlayListFill } from "react-icons/ri"

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
import { useLiveTransport } from "../hooks/useLiveTransport"
import { useHotkeys } from "react-hotkeys-hook"

type Props = {
  trackId: string
  onShowPlaylist: () => void
  hasPlaylist: boolean
  whepUrl?: string
  hlsUrl?: string
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

  const { audioRef } = useLiveTransport(whepUrl, hlsUrl, audioSend as
    (event: { type: "LOADED" } | { type: "PLAY" } | { type: "STOP" }) => void)

  const handleVolume = (v: number) => audioSend({ type: "CHANGE_VOLUME", volume: v })
  const handlePlayPause = () => audioSend({ type: "TOGGLE" })
  const handleMute = () => audioSend({ type: "TOGGLE_MUTE" })

  useHotkeys("space", () => handlePlayPause())

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume
    }
  }, [volume, muted, audioRef])

  useEffect(() => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.play().catch(() => {})
    } else {
      audioRef.current.pause()
    }
  }, [playing, audioRef])

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
