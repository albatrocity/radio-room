import React, { useRef, memo } from "react"
import { Box, Button, Nav, RangeInput } from "grommet"
import { Play, Pause, VolumeMute, Volume, List } from "grommet-icons"
import ReactHowler from "react-howler"

import { audioMachine } from "../machines/audioMachine"

const streamURL = process.env.GATSBY_STREAM_URL

const RadioPlayer = ({
  volume,
  meta,
  playing,
  ready,
  muted,
  onVolume,
  onPlayPause,
  onMute,
  onShowPlaylist,
  hasPlaylist,
}) => {
  const player = useRef(null)

  return (
    <Box>
      {ready && (
        <Nav
          direction="row"
          background="accent-4"
          justify="center"
          align="center"
          border={{ side: "bottom", color: "#adb871" }}
          pad={{ horizontal: "large" }}
        >
          <Box
            align="center"
            animation={
              !playing
                ? {
                    type: "pulse",
                    delay: 0,
                    duration: 400,
                    size: "large",
                  }
                : null
            }
          >
            <Button
              icon={playing ? <Pause color="brand" /> : <Play color="brand" />}
              onClick={() => onPlayPause()}
            />
          </Box>
          <Button
            icon={
              muted ? <VolumeMute color="brand" /> : <Volume color="brand" />
            }
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
          {hasPlaylist && (
            <Box flex={{ shrink: 0 }}>
              <Button onClick={onShowPlaylist} icon={<List color="brand" />} />
            </Box>
          )}
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
