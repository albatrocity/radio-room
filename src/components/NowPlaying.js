import React, { useContext } from "react"
import { useMachine } from "@xstate/react"
import { Box, Heading, Text, Image, ResponsiveContext } from "grommet"
import { Music, Unlink } from "grommet-icons"
import { isEmpty, get } from "lodash/fp"

import safeDate from "../lib/safeDate"
import { audioMachine } from "../machines/audioMachine"

const NowPlaying = () => {
  const size = useContext(ResponsiveContext)
  const [state, send] = useMachine(audioMachine)
  const { bitrate, album, artist, track, release = {}, cover } =
    get("context.meta", state) || {}
  const { mbid, releaseDate } = release || {}
  console.log(state.context.meta)
  const offline = bitrate === "0" || !bitrate || isEmpty(state.context.meta)
  const artworkSize = size === "small" ? "xsmall" : "small"
  const coverUrl = cover
    ? cover
    : mbid
    ? `https://coverartarchive.org/release/${mbid}/front-500`
    : null

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
            {coverUrl && state.matches("ready.cover.found") ? (
              <Box width={artworkSize}>
                <Image
                  onError={() => send("IMAGE_NOT_FOUND")}
                  height="small"
                  width="small"
                  src={coverUrl}
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
