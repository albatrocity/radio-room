import React, { useCallback, useEffect, useContext, memo } from "react"
import { Box, ResponsiveContext } from "grommet"
import { useMachine } from "@xstate/react"
import { isEmpty, get, kebabCase } from "lodash/fp"

import socket from "../lib/socket"
import NowPlaying from "./NowPlaying"
import RadioPlayer from "./RadioPlayer"
import ReactionCounter from "./ReactionCounter"
import { audioMachine } from "../machines/audioMachine"
import { useTrackReactions } from "../contexts/useTrackReactions"

const PlayerUi = ({
  onShowPlaylist,
  hasPlaylist,
  onOpenReactionPicker,
  onReactionClick,
}) => {
  const { state: trackState } = useTrackReactions()
  const size = useContext(ResponsiveContext)
  const isMobile = size === "small"
  const [state, send] = useMachine(audioMachine)
  const playing = state.matches({ online: { progress: "playing" } })
  const muted = state.matches({ online: { volume: "muted" } })
  const ready = state.matches("online")
  const coverFound = state.matches("ready.cover.found")
  const { volume, meta } = state.context
  const { bitrate, album, artist, track, release = {}, cover } = meta || {}
  const trackId = kebabCase(`${track}-${artist}-${album}`)

  const onCover = useCallback(hasCover => {
    if (hasCover) {
      send("TRY_COVER")
    } else {
      send("COVER_NOT_FOUND")
    }
  }, [])

  return (
    <Box>
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
              reactions={trackState.reactions[trackId]}
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
          onVolume={v => send("CHANGE_VOLUME", { volume: v })}
          onPlayPause={() => send("TOGGLE")}
          onMute={() => send("TOGGLE_MUTE")}
          onShowPlaylist={onShowPlaylist}
          hasPlaylist={hasPlaylist}
          isMobile={isMobile}
          trackId={trackId}
          onReactionClick={onReactionClick}
          onOpenPicker={onOpenReactionPicker}
          reactions={trackState.reactions[trackId]}
        />
      )}
    </Box>
  )
}

export default memo(PlayerUi)
