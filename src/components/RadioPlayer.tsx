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
  Button,
} from "@chakra-ui/react"

import { FiPlay, FiPause, FiVolume, FiVolumeX } from "react-icons/fi"
import { RiPlayListAddFill } from "react-icons/ri"
import { RiPlayListFill } from "react-icons/ri"
import ReactHowler from "react-howler"
import ReactionCounter from "./ReactionCounter"
import { EmojiData } from "emoji-mart"
import { ChatMessage } from "../types/ChatMessage"
import ButtonListeners from "./ButtonListeners"

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
  onOpenPicker: ({
    ref,
    reactTo,
  }: {
    ref: ReactNode
    reactTo: ChatMessage
  }) => void
  reactions: {}[]
  trackId: string
  canDj?: boolean
  onAddToQueue: () => void
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
  onOpenPicker,
  reactions,
  trackId,
  canDj,
  onAddToQueue,
}: RadioPlayerProps) => {
  const player = useRef(null)

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
                onOpenPicker={onOpenPicker}
                reactTo={{ type: "track", id: trackId }}
                reactions={reactions}
                onReactionClick={onReactionClick}
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
              {canDj && (
                <IconButton
                  icon={<Icon as={RiPlayListAddFill} boxSize={5} />}
                  aria-label="Add to Queue"
                  variant="ghost"
                  onClick={onAddToQueue}
                />
              )}
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
