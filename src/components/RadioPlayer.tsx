import React, { useRef, memo, useEffect, useCallback } from "react"
import {
  Box,
  Icon,
  IconButton,
  HStack,
  Show,
  Hide,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Container,
} from "@chakra-ui/react"

import { FiVolume, FiVolumeX } from "react-icons/fi"
import { RiPlayListFill } from "react-icons/ri"
import ReactHowler from "react-howler"
import ReactionCounter from "./ReactionCounter"
import ButtonListeners from "./ButtonListeners"
import ButtonAddToQueue from "./ButtonAddToQueue"
import { useHotkeys } from "react-hotkeys-hook"
import PlayStateIcon from "./PlayStateIcon"
import ButtonAddToLibrary from "./ButtonAddToLibrary"
import { RoomMeta } from "../types/Room"

interface RadioPlayerProps {
  volume: number
  meta?: RoomMeta
  playing: boolean
  muted: boolean
  onVolume: (volume: number) => void
  onPlayPause: () => void
  onMute: () => void
  onShowPlaylist: () => void
  onLoad: () => void
  onPlay: () => void
  hasPlaylist: boolean
  trackId: string
  loading: boolean
  streamUrl: string
}

const RadioPlayer = ({
  volume,
  playing,
  muted,
  meta,
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

  useHotkeys("space", () => {
    onPlayPause()
  })

  useEffect(() => {
    if (!!player.current && !player.current?.howler?.playing() && !playing) {
      if (player.current.howlerState() === "loaded") {
        player.current.howler?.stop()
      }
    }
  }, [playing, player.current])

  const handleError = useCallback(() => {
    if (playing && player.current) {
      player.current.howler?.stop()
    }
  }, [playing, player.current])

  return (
    <Box>
      <Hide above="sm">
        <Box background="actionBg">
          <Box py={1} h={10} overflowX="auto">
            <Box px={4} flexDir="row">
              <HStack alignItems="flex-start">
                <ButtonAddToLibrary id={meta?.release?.id} />
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
      </Hide>
      <Box background="actionBgLite" py={1}>
        <Container>
          <HStack
            w="100%"
            direction="row"
            justify="center"
            align="center"
            spacing={2}
          >
            {hasPlaylist && (
              <IconButton
                size="md"
                aria-label="Playlist"
                variant="ghost"
                onClick={onShowPlaylist}
                icon={<Icon boxSize={5} as={RiPlayListFill} />}
              />
            )}
            <HStack>
              <IconButton
                size="md"
                aria-label={playing ? "Stop" : "Play"}
                variant="ghost"
                icon={<PlayStateIcon loading={loading} playing={playing} />}
                onClick={() => onPlayPause()}
              />
              <IconButton
                size="md"
                aria-label={muted ? "Unmute" : "Mute"}
                variant="ghost"
                icon={
                  muted ? (
                    <Icon as={FiVolumeX} boxSize={5} />
                  ) : (
                    <Icon as={FiVolume} boxSize={5} />
                  )
                }
                onClick={() => onMute()}
              />
            </HStack>
            <HStack w="100%">
              <Show above="sm">
                <Slider
                  aria-label="slider-ex-4"
                  value={muted ? 0 : volume}
                  max={1.0}
                  min={0}
                  step={0.1}
                  onChange={(value) => onVolume(value)}
                >
                  <SliderTrack bg="whiteAlpha.500">
                    <SliderFilledTrack bg="action" />
                  </SliderTrack>
                  <SliderThumb boxSize={[6, 3]}>
                    <Box />
                  </SliderThumb>
                </Slider>
              </Show>
            </HStack>
            <Hide above="sm">
              <HStack>
                <ButtonAddToQueue showText={false} />

                <ButtonListeners variant="ghost" />
              </HStack>
            </Hide>
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
        />
      </Box>
    </Box>
  )
}

export default memo(RadioPlayer)
