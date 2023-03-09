import React, { useCallback, useContext, memo } from "react"
import { useActor, useSelector } from "@xstate/react"
import { Box, Container, Flex } from "@chakra-ui/react"
import { kebabCase } from "lodash/fp"
import { EmojiData } from "emoji-mart"

import { GlobalStateContext } from "../contexts/global"
import NowPlaying from "./NowPlaying"
import RadioPlayer from "./RadioPlayer"
import ReactionCounter from "./ReactionCounter"

import { TrackMeta } from "../types/Track"
import useCanDj from "./useCanDj"
import { useAllReactions } from "../lib/useAllReactions"
import { ActorRefFrom } from "xstate"
import { audioMachine } from "../machines/audioMachine"

const isUnauthorizedSelector = (state) => state.matches("unauthorized")

interface PlayerUiProps {
  onShowPlaylist: () => void
  hasPlaylist: boolean
  onOpenReactionPicker: ({
    ref,
    reactTo,
  }: {
    ref: HTMLButtonElement
    reactTo: string
  }) => void
  onReactionClick: (emoji: EmojiData) => void
  listenerCount: number
}

const isOnlineSelector = (state: ActorRefFrom<typeof audioMachine>) =>
  state.matches("online")
const isPlayingSelector = (state: ActorRefFrom<typeof audioMachine>) =>
  state.matches("online.progress.playing")
const isMutedSelector = (state: ActorRefFrom<typeof audioMachine>) =>
  state.matches("online.volume.muted")
const volumeSelector = (state: ActorRefFrom<typeof audioMachine>) =>
  state.context.volume
const metaSelector = (state: ActorRefFrom<typeof audioMachine>) =>
  state.context.meta

const PlayerUi = ({
  onShowPlaylist,
  hasPlaylist,
  onOpenReactionPicker,
  onReactionClick,
  listenerCount,
}: PlayerUiProps) => {
  const globalServices = useContext(GlobalStateContext)
  const isUnauthorized = useSelector(
    globalServices.authService,
    isUnauthorizedSelector,
  )
  const allReactions = useAllReactions("track")

  const isOnline = useSelector(globalServices.audioService, isOnlineSelector)
  const playing = useSelector(globalServices.audioService, isPlayingSelector)
  const muted = useSelector(globalServices.audioService, isMutedSelector)
  const volume: number = useSelector(
    globalServices.audioService,
    volumeSelector,
  )
  const meta: TrackMeta = useSelector(globalServices.audioService, metaSelector)
  const { album, artist, track } = meta || {}
  const trackId = kebabCase(`${track}-${artist}-${album}`)

  const handleVolume = useCallback(
    (v: number) =>
      globalServices.audioService.send("CHANGE_VOLUME", { volume: v }),
    [globalServices.audioService],
  )

  const handlePlayPause = useCallback(
    () => globalServices.audioService.send("TOGGLE"),
    [globalServices.audioService],
  )

  const handleMute = useCallback(
    () => globalServices.audioService.send("TOGGLE_MUTE"),
    [globalServices.audioService],
  )

  return (
    <Flex
      sx={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
      direction="column"
      height="100%"
    >
      <NowPlaying
        offline={!isOnline}
        // offline={false}
        meta={meta}
      />
      {isOnline && (
        <Box
          display={["none", "flex"]}
          background="actionBg"
          alignItems="center"
          py="1"
        >
          <Container>
            <ReactionCounter
              reactTo={{ type: "track", id: trackId }}
              darkBg={true}
            />
          </Container>
        </Box>
      )}
      {isOnline && (
        <RadioPlayer
          volume={volume}
          meta={meta}
          playing={playing}
          muted={muted}
          onVolume={handleVolume}
          onPlayPause={handlePlayPause}
          onMute={handleMute}
          onShowPlaylist={onShowPlaylist}
          hasPlaylist={hasPlaylist}
          trackId={trackId}
          onReactionClick={onReactionClick}
          onOpenPicker={onOpenReactionPicker}
          reactions={allReactions[trackId]}
        />
      )}
    </Flex>
  )
}

export default memo(PlayerUi)
