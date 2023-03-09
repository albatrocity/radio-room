import React, { useRef, memo, ReactNode, useEffect } from "react"
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

import { FiPlay, FiPause, FiVolume, FiVolumeX } from "react-icons/fi"
import { RiPlayListFill } from "react-icons/ri"
import ReactHowler from "react-howler"
import ReactionCounter from "./ReactionCounter"
import { EmojiData } from "emoji-mart"
import ButtonListeners from "./ButtonListeners"
import ButtonAddToQueue from "./ButtonAddToQueue"
import { useHotkeys } from "react-hotkeys-hook"

interface RadioPlayerProps {
  volume: number
  meta?: {}
  playing: boolean
  muted: boolean
  onVolume: (volume: number) => void
  onPlayPause: () => void
  onMute: () => void
  onShowPlaylist: () => void
  hasPlaylist: boolean
  onReactionClick: (emoji: EmojiData) => void
  reactions: {}[]
  trackId: string
}

const streamURL = process.env.GATSBY_STREAM_URL

const RadioPlayer = ({
  volume,
  playing,
  muted,
  onVolume,
  onPlayPause,
  onMute,
  onShowPlaylist,
  hasPlaylist,
  onReactionClick,
  reactions,
  trackId,
}: RadioPlayerProps) => {
  const player = useRef(null)

  useHotkeys("space", () => {
    onPlayPause()
  })

  useEffect(() => {
    if (player.current && !playing) {
      player.current.stop()
    }
  }, [playing, player])

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
              icon={
                playing ? (
                  <Icon as={FiPause} boxSize={5} />
                ) : (
                  <Icon as={FiPlay} boxSize={5} />
                )
              }
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
        volume={parseFloat(volume)}
      />
    </Box>
  )
}

export default memo(RadioPlayer)
