import React, { useCallback, useContext, memo } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { Box, Container, Flex } from "@chakra-ui/react"
import { kebabCase } from "lodash/fp"
import { EmojiData } from "emoji-mart"

import { GlobalStateContext } from "../contexts/global"
import NowPlaying from "./NowPlaying"
import RadioPlayer from "./RadioPlayer"
import ReactionCounter from "./ReactionCounter"
import { audioMachine } from "../machines/audioMachine"

import { TrackMeta } from "../types/Track"
import useCanDj from "./useCanDj"
import { useAllReactions } from "../lib/useAllReactions"

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

const PlayerUi = ({
  onShowPlaylist,
  hasPlaylist,
  onOpenReactionPicker,
  onReactionClick,
  listenerCount,
}: PlayerUiProps) => {
  const globalServices = useContext(GlobalStateContext)
  const [state, send] = useMachine(audioMachine)
  const isUnauthorized = useSelector(
    globalServices.authService,
    isUnauthorizedSelector,
  )
  const allReactions = useAllReactions("track")

  const playing = state.matches({ online: { progress: "playing" } })
  const muted = state.matches({ online: { volume: "muted" } })
  const ready = state.matches("online")
  const coverFound = state.matches("online.cover.found")
  const { volume, meta }: { volume: number; meta: TrackMeta } = state.context
  const { bitrate, album, artist, track, release = {}, cover } = meta || {}
  const trackId = kebabCase(`${track}-${artist}-${album}`)
  const canDj = useCanDj()

  const onCover = useCallback(
    (hasCover: boolean) => {
      if (ready) {
        if (hasCover) {
          send("TRY_COVER")
        } else {
          send("COVER_NOT_FOUND")
        }
      }
    },
    [ready],
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
        playing={playing}
        muted={muted}
        onCover={onCover}
        coverFound={coverFound}
        offline={state.matches("offline")}
        meta={meta}
        flexGrow={1}
      />
      {state.matches("online") && (
        <Box
          display={["none", "flex"]}
          background="actionBg"
          alignItems="center"
          py="1"
        >
          <Container>
            <ReactionCounter
              onOpenPicker={onOpenReactionPicker}
              reactTo={{ type: "track", id: trackId }}
              reactions={allReactions[trackId]}
              onReactionClick={onReactionClick}
              darkBg={true}
            />
          </Container>
        </Box>
      )}
      {state.matches("online") && (
        <RadioPlayer
          volume={volume}
          meta={meta}
          playing={playing}
          muted={muted}
          onVolume={(v) => send("CHANGE_VOLUME", { volume: v })}
          onPlayPause={() => send("TOGGLE")}
          onMute={() => send("TOGGLE_MUTE")}
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
