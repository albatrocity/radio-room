import React, { useRef, memo, ReactNode } from "react"
import {
  Box,
  IconButton,
  HStack,
  Flex,
  Show,
  Hide,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from "@chakra-ui/react"
import { Play, Pause, VolumeMute, Volume, List } from "grommet-icons"
import ReactHowler from "react-howler"
import ReactionCounter from "./ReactionCounter"
import { EmojiData } from "emoji-mart"
import { ChatMessage } from "../types/ChatMessage"

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
}: RadioPlayerProps) => {
  const player = useRef(null)

  return (
    <Box>
      <Flex
        w="100%"
        direction="row"
        background="accent-4"
        justify="center"
        align="center"
        border={{ side: "bottom", color: "#adb871" }}
        px="large"
      >
        <HStack>
          <IconButton
            aria-label={playing ? "Pause" : "Play"}
            background="transparent"
            icon={playing ? <Pause color="brand" /> : <Play color="brand" />}
            onClick={() => onPlayPause()}
          />
          <IconButton
            aria-label={muted ? "Unmute" : "Mute"}
            background="transparent"
            icon={
              muted ? <VolumeMute color="brand" /> : <Volume color="brand" />
            }
            onClick={() => onMute()}
          />
        </HStack>
        <Flex shrink={0} grow={1} maxW="md">
          <Hide above="sm">
            <ReactionCounter
              onOpenPicker={onOpenPicker}
              reactTo={{ type: "track", id: trackId }}
              reactions={reactions}
              onReactionClick={onReactionClick}
              buttonColor="rgba(255,255,255,0.4)"
              iconColor="brand"
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
                <SliderFilledTrack bg="primary" />
              </SliderTrack>
              <SliderThumb boxSize={[6, 3]}>
                <Box />
              </SliderThumb>
            </Slider>
          </Show>
        </Flex>
        {hasPlaylist && (
          <Flex flex={{ shrink: 0 }}>
            <IconButton
              aria-label="Playlist"
              background="transparent"
              onClick={onShowPlaylist}
              icon={<List color="brand" />}
            />
          </Flex>
        )}
      </Flex>
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
