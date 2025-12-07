import { useRef, memo, useEffect, useCallback } from "react"
import { Box, Icon, IconButton, HStack, Slider, Container } from "@chakra-ui/react"

import { LuVolume2, LuVolumeX } from "react-icons/lu"
import { RiPlayListFill } from "react-icons/ri"
import ReactHowler from "react-howler"
import ReactionCounter from "./ReactionCounter"
import ButtonListeners from "./ButtonListeners"
import ButtonAddToQueue from "./ButtonAddToQueue"
import { useHotkeys } from "react-hotkeys-hook"
import PlayStateIcon from "./PlayStateIcon"
import AdminControls from "./AdminControls"
import ButtonAddToLibrary from "./ButtonAddToLibrary"
import { useIsAdmin } from "../hooks/useActors"

interface RadioPlayerProps {
  volume: number
  playing: boolean
  muted: boolean
  onVolume: (volume: number) => void
  onPlayPause: () => void
  onMute: () => void
  onShowPlaylist: () => void
  onLoad: () => void
  onPlay: () => void
  hasPlaylist: boolean
  trackId: string // For reactions (stable ID)
  loading: boolean
  streamUrl: string
}

const RadioPlayer = ({
  volume,
  playing,
  muted,
  onVolume,
  onPlayPause,
  onLoad,
  onPlay,
  onMute,
  onShowPlaylist,
  hasPlaylist,
  trackId,
  loading,
  streamUrl,
}: RadioPlayerProps) => {
  const player = useRef<ReactHowler>(null)
  const isAdmin = useIsAdmin()

  useHotkeys("space", () => {
    onPlayPause()
  })

  useEffect(() => {
    if (!!player.current && !player.current?.howler?.playing() && !playing) {
      if (player.current.howlerState() === "loaded") {
        player.current.howler?.stop()
      }
    }
    return () => {
      player.current?.howler?.unload()
    }
  }, [playing, player.current])

  const handleError = useCallback(() => {
    if (playing && player.current) {
      player.current.howler?.stop()
    }
  }, [playing, player.current])

  return (
    <Box>
      <Box hideFrom="sm" background="actionBg">
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
      <Box background="actionBgLite" py={1}>
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
                onClick={() => onPlayPause()}
              >
                <PlayStateIcon loading={loading} playing={playing} />
              </IconButton>
              {!isAdmin && (
                <IconButton
                  size="md"
                  aria-label={muted ? "Unmute" : "Mute"}
                  variant="ghost"
                  onClick={() => onMute()}
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
                onValueChange={(details) => onVolume(details.value[0])}
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
        <ReactHowler
          src={streamUrl}
          preload={false}
          playing={playing}
          mute={muted}
          html5={true}
          ref={player}
          volume={volume}
          onPlayError={handleError}
          onLoadError={handleError}
          onStop={handleError}
          onEnd={handleError}
          onPlay={onPlay}
          onLoad={onLoad}
          autoSuspend={false}
        />
      </Box>
    </Box>
  )
}

export default memo(RadioPlayer)
