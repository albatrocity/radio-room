import React, { useContext } from "react"
import { Box, Heading, Text, Image, ResponsiveContext } from "grommet"
import { Music, Unlink } from "grommet-icons"
import { isEmpty } from "lodash/fp"

import safeDate from "../lib/safeDate"
import PlayerContext from "../contexts/PlayerContext"

const NowPlaying = () => {
  const { state } = useContext(PlayerContext)
  const size = useContext(ResponsiveContext)
  const { title, bitrate, album, artist, track, release = {} } = state.meta
  const { mbid, releaseDate } = release
  const offline = bitrate === "0" || !bitrate || isEmpty(state.meta)
  const artworkSize = size === "small" ? "xsmall" : "small"

  return (
    <Box pad="small" align="center" background="dark-1">
      {offline && (
        <Box direction="row" gap="small" align="center">
          <Unlink color="black" />
          <Heading margin="none" level={2}>
            Offline :(
          </Heading>
        </Box>
      )}
      {!offline && (
        <>
          <Box direction="row" gap="small" justify="center">
            {mbid ? (
              <Box width={artworkSize}>
                <Image
                  height="small"
                  width="small"
                  src={`https://coverartarchive.org/release/${mbid}/front-500`}
                />
              </Box>
            ) : (
              <Box
                background="light-2"
                height="small"
                width="small"
                align="center"
                justify="center"
              >
                <Music size="large" />
              </Box>
            )}
            <Box justify="center">
              {track && (
                <Heading margin="none" level={3}>
                  {track}
                </Heading>
              )}
              {artist && (
                <Heading margin="none" level={4}>
                  {artist}
                </Heading>
              )}
              {album && (
                <Text margin="none" size="small">
                  {album}
                </Text>
              )}
              {releaseDate && (
                <Text size="xsmall">Released {safeDate(releaseDate)}</Text>
              )}
            </Box>
          </Box>
        </>
      )}
    </Box>
  )
}

export default NowPlaying
