import React, { useRef, memo, ReactNode } from "react"
import {
  Box,
  Icon,
  IconButton,
  HStack,
  Flex,
  Show,
  Hide,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Container,
  Text,
  Button,
} from "@chakra-ui/react"
import {
  GrPlayFill,
  GrPauseFill,
  GrVolumeMute,
  GrVolume,
  GrList,
  GrGroup,
} from "react-icons/gr"
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
  onShowListeners: () => void
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
  listenerCount: number
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
  onShowListeners,
  hasPlaylist,
  onReactionClick,
  onOpenPicker,
  reactions,
  trackId,
  listenerCount,
}: RadioPlayerProps) => {
  const player = useRef(null)

  return (
    <Box background="accent-4" border={{ side: "bottom", color: "#adb871" }}>
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
              aria-label="Playlist"
              background="transparent"
              onClick={onShowPlaylist}
              icon={<Icon as={GrList} />}
            />
          )}
          <HStack>
            <IconButton
              aria-label={playing ? "Pause" : "Play"}
              background="transparent"
              icon={
                playing ? <Icon as={GrPauseFill} /> : <Icon as={GrPlayFill} />
              }
              onClick={() => onPlayPause()}
            />
            <IconButton
              aria-label={muted ? "Unmute" : "Mute"}
              background="transparent"
              icon={
                muted ? (
                  <Icon as={GrVolumeMute} color="brand" />
                ) : (
                  <Icon as={GrVolume} color="brand" />
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
          </HStack>
          <Hide above="sm">
            <HStack>
              <Button
                onClick={onShowListeners}
                aria-label="Listeners"
                leftIcon={<Icon as={GrGroup} />}
                background="transparent"
                size="sm"
              >
                {listenerCount}
              </Button>
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
