import React, { useCallback, useEffect, memo } from "react"
import { Box } from "grommet"
import { useMachine } from "@xstate/react"
import { isEmpty, get } from "lodash/fp"

import socket from "../lib/socket"
import NowPlaying from "./NowPlaying"
import RadioPlayer from "./RadioPlayer"
import { audioMachine } from "../machines/audioMachine"

const PlayerUi = ({ onShowPlaylist, hasPlaylist }) => {
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
      />
    </Box>
  )
}

export default memo(PlayerUi)
