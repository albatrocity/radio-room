import React, { useCallback, memo } from "react"
import { Box, Container, Flex, HStack } from "@chakra-ui/react"

import NowPlaying from "./NowPlaying"
import RadioPlayer from "./RadioPlayer"
import ReactionCounter from "./ReactionCounter"
import ButtonAddToLibrary from "./ButtonAddToLibrary"

import { useAuthStore } from "../state/authStore"
import {
  useAudioStore,
  useIsBuffering,
  useIsMuted,
  useIsPlaying,
  useIsStationOnline,
  useStationMeta,
  useVolume,
} from "../state/audioStore"
import createTrackId from "../lib/createTrackId"
import { useCurrentRoomHasAudio } from "../state/roomStore"

interface PlayerUiProps {
  onShowPlaylist: () => void
  hasPlaylist: boolean
  listenerCount: number
}

const PlayerUi = ({ onShowPlaylist, hasPlaylist }: PlayerUiProps) => {
  const { state: authState } = useAuthStore()
  const hasAudio = useCurrentRoomHasAudio()
  const isUnauthorized = authState.matches("unauthorized")

  const { send: audioSend } = useAudioStore()
  const isOnline = useIsStationOnline()
  const playing = useIsPlaying()
  const muted = useIsMuted()
  const volume = useVolume()
  const meta = useStationMeta()
  const loading = useIsBuffering()
  const { album, artist, track } = meta || {}
  const trackId = createTrackId({ track, artist, album })

  const handleVolume = useCallback(
    (v: number) => audioSend("CHANGE_VOLUME", { volume: v }),
    [audioSend],
  )

  const handlePlayPause = useCallback(() => audioSend("TOGGLE"), [audioSend])

  const handleMute = useCallback(() => audioSend("TOGGLE_MUTE"), [audioSend])

  const handleLoad = useCallback(() => {
    return audioSend("LOADED")
  }, [audioSend])

  const handlePlay = useCallback(() => {
    return audioSend("PLAY")
  }, [audioSend])

  return (
    <Flex
      sx={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
      direction="column"
      height="100%"
    >
      {meta && <NowPlaying offline={!isOnline} meta={meta} />}
      {isOnline && (
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
      )}
      {isOnline && hasAudio && (
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
        />
      )}
    </Flex>
  )
}

export default memo(PlayerUi)
