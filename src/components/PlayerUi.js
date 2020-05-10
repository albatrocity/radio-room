import React, { useCallback, useEffect } from "react"
import { Box } from "grommet"
import { useMachine } from "@xstate/react"
import { isEmpty, get } from "lodash/fp"

import socket from "../lib/socket"
import NowPlaying from "./NowPlaying"
import RadioPlayer from "./RadioPlayer"
import { audioMachine } from "../machines/audioMachine"

const PlayerUi = () => {
  const [state, send] = useMachine(audioMachine, {
    services: {
      pingOffline: () => {
        return new Promise((resolve, reject) => {
          socket.on("meta", payload => {
            if (
              get("meta.bitrate", payload) &&
              get("meta.bitrate", payload) !== "0"
            ) {
              resolve(payload)
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
  const { volume, meta } = state.context
  const { bitrate, album, artist, track, release = {}, cover } =
    get("context.meta", state) || {}

  const offline = bitrate === "0" || !bitrate || isEmpty(state.context.meta)

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
  })

  return (
    <Box>
      <NowPlaying state={state} onCover={onCover} />
      <RadioPlayer
        volume={volume}
        meta={meta}
        onVolume={v => send("CHANGE_VOLUME", { volume: v })}
        onPlayPause={() => send("TOGGLE")}
        onMute={() => send("TOGGLE_MUTE")}
        state={state}
      />
    </Box>
  )
}

export default PlayerUi
