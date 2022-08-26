import React, { useCallback, useContext, memo } from "react"
import { Box, ResponsiveContext } from "grommet"
import { useMachine, useSelector } from "@xstate/react"
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
  hasPlaylist: boolean
  onOpenReactionPicker: ({
    ref,
    reactTo,
  }: {
    ref: HTMLButtonElement
    reactTo: string
  }) => void
  onReactionClick: ({ colons }: { colons: EmojiData }) => void
}

const PlayerUi = ({
  onShowPlaylist,
  hasPlaylist,
  onOpenReactionPicker,
  onReactionClick,
}: PlayerUiProps) => {
  const size = useContext(ResponsiveContext)
  const globalServices = useContext(GlobalStateContext)
  const isMobile = size === "small"
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
    (hasCover) => {
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
      style={{
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
      {state.matches("online") && !isMobile && (
        <Box pad="small" background="brand" align="center">
          <Box width={{ max: "medium" }} fill flex={{ grow: 1 }}>
            <ReactionCounter
              onOpenPicker={onOpenReactionPicker}
              reactTo={{ type: "track", id: trackId }}
              reactions={allReactions["track"][trackId]}
              onReactionClick={onReactionClick}
              buttonColor="accent-4"
              iconColor="accent-4"
              showAddButton={true}
            />
          </Box>
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
          isMobile={isMobile}
          trackId={trackId}
          onReactionClick={onReactionClick}
          onOpenPicker={onOpenReactionPicker}
          reactions={allReactions["track"][trackId]}
        />
      )}
    </Box>
  )
}

export default memo(PlayerUi)
