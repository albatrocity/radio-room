import React, { useCallback, useContext, memo } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { Box, Container } from "@chakra-ui/react"
import { kebabCase } from "lodash/fp"
import { EmojiData } from "emoji-mart"

import { GlobalStateContext } from "../contexts/global"
import NowPlaying from "./NowPlaying"
import RadioPlayer from "./RadioPlayer"
import ReactionCounter from "./ReactionCounter"
import { audioMachine } from "../machines/audioMachine"

import { TrackMeta } from "../types/Track"

const isUnauthorizedSelector = (state) => state.matches("unauthorized")
const allReactionsSelector = (state) => state.context.reactions

interface PlayerUiProps {
  onShowPlaylist: () => void
  onShowListeners: () => void
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
  onShowListeners,
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
  const allReactions = useSelector(
    globalServices.allReactionsService,
    allReactionsSelector,
  )

  const playing = state.matches({ online: { progress: "playing" } })
  const muted = state.matches({ online: { volume: "muted" } })
  const ready = state.matches("online")
  const coverFound = state.matches("online.cover.found")
  const { volume, meta }: { volume: number; meta: TrackMeta } = state.context
  const { bitrate, album, artist, track, release = {}, cover } = meta || {}
  const trackId = kebabCase(`${track}-${artist}-${album}`)

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
    <Box
      sx={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
    >
      <NowPlaying
        playing={playing}
        muted={muted}
        onCover={onCover}
        coverFound={coverFound}
        offline={state.matches("offline")}
        meta={meta}
      />
      {state.matches("online") && (
        <Box display={["none", "flex"]} background="brand" alignItems="center">
          <Container>
            <ReactionCounter
              onOpenPicker={onOpenReactionPicker}
              reactTo={{ type: "track", id: trackId }}
              reactions={allReactions["track"][trackId]}
              onReactionClick={onReactionClick}
              buttonColor="accent-4"
              iconColor="accent-4"
              showAddButton={true}
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
          onShowListeners={onShowListeners}
          hasPlaylist={hasPlaylist}
          trackId={trackId}
          onReactionClick={onReactionClick}
          onOpenPicker={onOpenReactionPicker}
          reactions={allReactions["track"][trackId]}
          listenerCount={listenerCount}
        />
      )}
    </Box>
  )
}

export default memo(PlayerUi)
