import React, { useState, useRef, useEffect } from "react"
import { useMachine } from "@xstate/react"
import {
  Box,
  Header,
  Main,
  Button,
  Icons,
  Heading,
  Paragraph,
  Menu,
  Sidebar,
  Nav,
  Avatar,
  RangeInput,
} from "grommet"
import { Play, Pause, VolumeMute, Volume } from "grommet-icons"
import ReactHowler from "react-howler"

import { audioMachine } from "../machines/audioMachine"

const streamURL = process.env.GATSBY_STREAM_URL

const RadioPlayer = () => {
  const player = useRef(null)
  const [state, send] = useMachine(audioMachine)
  const playing = state.matches({ progress: "playing" })
  const muted = state.matches({ volume: "muted" })
  const { volume, meta } = state.context
  console.log("meta", meta)

  return (
    <Box>
      <Nav
        direction="row"
        background="brand"
        justify="center"
        align="center"
        pad={{ horizontal: "small" }}
      >
        <Button
          icon={playing ? <Pause /> : <Play />}
          onClick={() => send("TOGGLE")}
        />
        <Button
          icon={muted ? <VolumeMute /> : <Volume />}
          onClick={() => send("TOGGLE_MUTE")}
        />
        <Box width="medium">
          <RangeInput
            value={muted ? 0 : volume}
            max={1.0}
            min={0}
            step={0.1}
            onChange={event =>
              send("CHANGE_VOLUME", { volume: event.target.value })
            }
          />
        </Box>
      </Nav>
      <ReactHowler
        src={[streamURL]}
        preload={false}
        playing={playing}
        mute={muted}
        html5={true}
        ref={player}
        volume={parseFloat(volume)}
      />
    </Box>
  )
}

export default RadioPlayer
