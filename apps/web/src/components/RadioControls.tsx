import React, { useEffect } from "react"
import { Box, Container, HStack } from "@chakra-ui/react"

import ReactionCounter from "./ReactionCounter"
import ButtonAddToLibrary from "./ButtonAddToLibrary"
import RadioPlayer from "./RadioPlayer"
import {
  useAudioStore,
  useIsBuffering,
  useIsMuted,
  useIsPlaying,
  useVolume,
} from "../state/audioStore"
import { RoomMeta } from "../types/Room"

type Props = {
  meta?: RoomMeta
  trackId: string
  onShowPlaylist: () => void
  hasPlaylist: boolean
  streamUrl?: string
}

export default function RadioControls({
  meta,
  trackId,
  onShowPlaylist,
  hasPlaylist,
  streamUrl,
}: Props) {
  const { send: audioSend } = useAudioStore()
  const playing = useIsPlaying()
  const muted = useIsMuted()
  const volume = useVolume()
  const loading = useIsBuffering()
  const handleVolume = (v: number) => audioSend("CHANGE_VOLUME", { volume: v })

  const handlePlayPause = () => audioSend("TOGGLE")
  const handleMute = () => audioSend("TOGGLE_MUTE")
  const handleLoad = () => audioSend("LOADED")
  const handlePlay = () => audioSend("PLAY")

  useEffect(() => {
    return () => {
      audioSend("STOP")
    }
  }, [])

  return (
    <Box>
      <Box
        display={["none", "flex"]}
        background="actionBg"
        alignItems="center"
        py="1"
      >
        <Container>
          <HStack>
            <ButtonAddToLibrary id={meta?.release?.id} />
            <ReactionCounter
              reactTo={{ type: "track", id: trackId }}
              darkBg={true}
              showAddButton={true}
            />
          </HStack>
        </Container>
      </Box>
      {streamUrl && (
        <RadioPlayer
          volume={volume}
          meta={meta}
          playing={playing}
          muted={muted}
          onVolume={handleVolume}
          onPlayPause={handlePlayPause}
          onLoad={handleLoad}
          onPlay={handlePlay}
          onMute={handleMute}
          onShowPlaylist={onShowPlaylist}
          hasPlaylist={hasPlaylist}
          trackId={trackId}
          loading={loading}
          streamUrl={streamUrl}
        />
      )}
    </Box>
  )
}
