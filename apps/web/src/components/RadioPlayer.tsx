import { memo, useEffect, useCallback } from "react"
import { Box, Icon, IconButton, HStack, Slider, Container } from "@chakra-ui/react"

import { LuListMusic, LuVolume2, LuVolumeX } from "react-icons/lu"
import ReactionCounter from "./ReactionCounter"
import ButtonListeners from "./ButtonListeners"
import ButtonAddToQueue from "./ButtonAddToQueue"
import ButtonPolls from "./ButtonPolls"
import { useHotkeys } from "react-hotkeys-hook"
import PlayPauseButton from "./PlayPauseButton"
import AdminControls from "./AdminControls"
import ButtonAddToLibrary from "./ButtonAddToLibrary"
import { useIsAdmin } from "../hooks/useActors"
import ButtonSchedule from "./ButtonSchedule"
import {
  configureRadioStreamPlayer,
  getRadioStreamPlayerDebug,
  installRadioStreamPlayerAutoUnlock,
  primeRadioStreamPlayerFromGesture,
  setRadioStreamPlayerMuted,
  setRadioStreamPlayerPlaying,
  setRadioStreamPlayerUrl,
  setRadioStreamPlayerVolume,
  stopRadioStreamPlayer,
} from "../lib/radioStreamPlayer"

interface RadioPlayerProps {
  volume: number
  playing: boolean
  /** Mute the stream (user mute or preview ducking). */
  muted: boolean
  /** User-initiated mute — controls slider display and mute button state. */
  volumeMuted?: boolean
  onVolume: (volume: number) => void
  onPlayPause: () => void
  onMute: () => void
  onShowPlaylist: () => void
  onLoad: () => void
  onPlay: () => void
  /** Connection failed — leave the loading state instead of spinning forever. */
  onError: () => void
  hasPlaylist: boolean
  trackId: string
  loading: boolean
  streamUrl: string
}

const RadioPlayer = ({
  volume,
  playing,
  muted,
  volumeMuted,
  onVolume,
  onPlayPause,
  onLoad,
  onPlay,
  onError,
  onMute,
  onShowPlaylist,
  hasPlaylist,
  trackId,
  loading,
  streamUrl,
}: RadioPlayerProps) => {
  const isAdmin = useIsAdmin()
  const showVolumeMuted = volumeMuted ?? muted

  useEffect(() => {
    configureRadioStreamPlayer({
      onLoad,
      onPlay,
      onError,
    })
    const removeAutoUnlock = installRadioStreamPlayerAutoUnlock()
    if (import.meta.env.DEV) {
      ;(window as Window & { __radioAudioDebug?: () => unknown }).__radioAudioDebug =
        getRadioStreamPlayerDebug
    }
    return () => {
      removeAutoUnlock()
      stopRadioStreamPlayer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setRadioStreamPlayerUrl(streamUrl)
  }, [streamUrl])

  useEffect(() => {
    setRadioStreamPlayerVolume(volume)
  }, [volume])

  useEffect(() => {
    setRadioStreamPlayerMuted(muted)
  }, [muted])

  useEffect(() => {
    setRadioStreamPlayerPlaying(playing)
  }, [playing])

  const handlePlayPauseClick = useCallback(() => {
    primeRadioStreamPlayerFromGesture()
    onPlayPause()
  }, [onPlayPause])

  useHotkeys("space", () => {
    handlePlayPauseClick()
  })

  return (
    <Box>
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
                  <Icon boxSize={5} as={LuListMusic} />
                </IconButton>
              )}
              <PlayPauseButton
                playing={playing}
                loading={loading}
                onClick={handlePlayPauseClick}
              />
              {!isAdmin && (
                <IconButton
                  size="md"
                  aria-label={showVolumeMuted ? "Unmute" : "Mute"}
                  variant="ghost"
                  onClick={() => onMute()}
                >
                  {showVolumeMuted ? (
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
                value={[showVolumeMuted ? 0 : volume]}
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
                <ButtonPolls showText={false} />
                <ButtonAddToQueue showText={false} />
                <ButtonSchedule showText={false} />
                <ButtonListeners variant="ghost" padding={0} />
              </HStack>
            </Box>
          </HStack>
        </Container>
      </Box>
    </Box>
  )
}

export default memo(RadioPlayer)
