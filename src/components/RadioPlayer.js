import React, { useState, useRef, useEffect } from "react"
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

const streamURL = "http://99.198.118.250:8391/stream?type=http&nocache=4"
// const streamURL = "78.129.178.98:9092/stream?type=http&icy=http"

const RadioPlayer = () => {
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1.0)
  const player = useRef(null)

  const stop = () => {
    player.current && player.current.stop()
    setPlaying(false)
  }

  useEffect(() => {
    if (!muted && volume === "0") {
      setVolume(1.0)
    }
  }, [muted])

  useEffect(() => {
    if (volume === "0") {
      setMuted(true)
    } else {
      setMuted(false)
    }
  }, [volume])

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
          onClick={() => (playing ? stop() : setPlaying(true))}
        />
        <Button
          icon={muted ? <VolumeMute /> : <Volume />}
          onClick={() => (muted ? setMuted(false) : setMuted(true))}
        />
        <Box width="medium">
          <RangeInput
            value={muted ? 0 : volume}
            max={1.0}
            min={0}
            step={0.1}
            onChange={event => setVolume(event.target.value)}
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
