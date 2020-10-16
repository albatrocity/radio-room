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
  const [state, send] = useMachine(audioMachine, {
    services: {
      pingOffline: () => {
        return new Promise((resolve, reject) => {
          socket.on("meta", payload => {
            if (get("bitrate", payload) && get("bitrate", payload) !== "0") {
              resolve({ meta: payload })
            }
          })
          socket.on("init", payload => {
            if (
              get("meta.bitrate", payload) &&
              get("meta.bitrate", payload) !== "0"
            ) {
              resolve(payload)
            }
          })
        })
      },
    },
  })
  const playing = state.matches({ ready: { progress: "playing" } })
  const muted = state.matches({ ready: { volume: "muted" } })
  const ready = state.matches("ready")
  const coverFound = state.matches("ready.cover.found")
  const { volume, meta } = state.context
  const { bitrate, album, artist, track, release = {}, cover } = meta || {}
  const trackId = kebabCase(`${track}-${artist}-${album}`)

  const offline =
    get("bitrate", meta) === "0" || !get("bitrate", meta) || isEmpty(meta)

  useEffect(() => {
    if (offline) {
      send("OFFLINE")
    } else {
      send("ONLINE")
    }
  }, [offline])

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
        ready={ready}
        onCover={onCover}
        coverFound={coverFound}
        offline={offline}
        meta={meta}
      />
      {!offline && !isMobile && (
        <Box pad="small" background="brand" align="center">
          <Box width={{ max: "medium" }} fill flex={{ grow: 1 }}>
            <ReactionCounter
              onOpenPicker={onOpenReactionPicker}
              reactTo={{ type: "track", id: trackId }}
              reactions={trackState.reactions[trackId]}
              onReactionClick={onReactionClick}
              color="accent-4"
            />
          </Box>
        </Box>
      )}
      <RadioPlayer
        volume={volume}
        meta={meta}
        ready={ready}
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
    </Box>
  )
}

export default memo(PlayerUi)
