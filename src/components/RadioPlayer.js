import React, { useRef } from "react"
import { useMachine } from "@xstate/react"
import { Box, Button, Nav, RangeInput } from "grommet"
import { Play, Pause, VolumeMute, Volume } from "grommet-icons"
import ReactHowler from "react-howler"

import { audioMachine } from "../machines/audioMachine"

const streamURL = process.env.GATSBY_STREAM_URL

const RadioPlayer = () => {
  const player = useRef(null)
  const [state, send] = useMachine(audioMachine)
  const playing = state.matches({ ready: { progress: "playing" } })
  const muted = state.matches({ ready: { volume: "muted" } })
  const { volume, meta } = state.context

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
