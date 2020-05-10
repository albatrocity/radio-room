import React, { useRef, memo } from "react"
import { useMachine } from "@xstate/react"
import { Box, Button, Nav, RangeInput } from "grommet"
import { Play, Pause, VolumeMute, Volume } from "grommet-icons"
import ReactHowler from "react-howler"

import { audioMachine } from "../machines/audioMachine"

const streamURL = process.env.GATSBY_STREAM_URL

const RadioPlayer = ({
  volume,
  meta,
  state,
  onVolume,
  onPlayPause,
  onMute,
}) => {
  const player = useRef(null)
  const playing = state.matches({ ready: { progress: "playing" } })
  const muted = state.matches({ ready: { volume: "muted" } })

  return (
    <Box>
      {state.matches("ready") && (
        <Nav
          direction="row"
          background="brand"
          justify="center"
          align="center"
          pad={{ horizontal: "small" }}
        >
          <Box
            basis="80px"
            animation={
              !playing
                ? {
                    type: "pulse",
                    delay: 0,
                    duration: 400,
                    size: "medium",
                  }
                : null
            }
          >
            <Button
              icon={playing ? <Pause /> : <Play />}
              onClick={() => onPlayPause()}
            />
          </Box>
          <Button
            icon={muted ? <VolumeMute /> : <Volume />}
            onClick={() => onMute()}
          />
          <Box width="medium">
            <RangeInput
              value={muted ? 0 : volume}
              max={1.0}
              min={0}
              step={0.1}
              onChange={event => onVolume(event.target.value)}
            />
          </Box>
        </Nav>
      )}
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

export default memo(RadioPlayer)
