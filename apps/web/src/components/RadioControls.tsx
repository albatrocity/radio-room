import { useEffect } from "react"
import { Box, Container, HStack } from "@chakra-ui/react"

import ReactionCounter from "./ReactionCounter"
import ButtonAddToLibrary from "./ButtonAddToLibrary"
import RadioPlayer from "./RadioPlayer"
import {
  useAudioSend,
  useDuckGain,
  useIsAudioLoading,
  useIsMuted,
  useIsPlaying,
  useVolume,
} from "../hooks/useActors"
import { programmeOutput } from "../lib/programmeDuck"

type Props = {
  trackId: string // For reactions (stable ID)
  onShowPlaylist: () => void
  hasPlaylist: boolean
  streamUrl?: string
}

export default function RadioControls({ trackId, onShowPlaylist, hasPlaylist, streamUrl }: Props) {
  const audioSend = useAudioSend()
  const playing = useIsPlaying()
  const muted = useIsMuted()
  const duckGain = useDuckGain()
  const volume = useVolume()
  const loading = useIsAudioLoading()
  const { outputVolume, outputMuted } = programmeOutput(volume, muted, duckGain)
  const handleVolume = (v: number) => audioSend({ type: "CHANGE_VOLUME", volume: v })

  const handlePlayPause = () => audioSend({ type: "TOGGLE" })
  const handleMute = () => audioSend({ type: "TOGGLE_MUTE" })
  const handleLoad = () => audioSend({ type: "LOADED" })
  const handlePlay = () => audioSend({ type: "PLAY" })
  const handleError = () => audioSend({ type: "STOP" })

  useEffect(() => {
    return () => {
      audioSend({ type: "STOP" })
    }
  }, [])

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
      {streamUrl && (
        <RadioPlayer
          volume={volume}
          outputVolume={outputVolume}
          playing={playing}
          muted={outputMuted}
          volumeMuted={muted}
          onVolume={handleVolume}
          onPlayPause={handlePlayPause}
          onLoad={handleLoad}
          onPlay={handlePlay}
          onError={handleError}
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
