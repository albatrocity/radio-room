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

interface RadioPlayerProps {
  volume: number
  meta?: {}
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
}

const streamURL = process.env.GATSBY_STREAM_URL

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
}: RadioPlayerProps) => {
  const player = useRef(null)

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
            <Hide above="sm">
              <ReactionCounter
                reactTo={{ type: "track", id: trackId }}
                showAddButton={true}
              />
            </Hide>

            <Show above="sm">
              <Slider
                aria-label="slider-ex-4"
                value={muted ? 0 : parseFloat(volume)}
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
        src={[streamURL]}
        preload={false}
        playing={playing}
        mute={muted}
        html5={true}
        ref={player}
        pool={1}
        volume={parseFloat(volume)}
        onPlayError={handleError}
        onLoadError={handleError}
        onStop={handleError}
        onEnd={handleError}
        onPlay={onPlay}
        onLoad={onLoad}
      />
    </Box>
  )
}

export default memo(RadioPlayer)
