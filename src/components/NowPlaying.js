import React, { useContext, useEffect } from "react"
import { useMachine } from "@xstate/react"
import { Box, Heading, Text, Image, ResponsiveContext, Anchor } from "grommet"
import { Music, Unlink } from "grommet-icons"
import { isEmpty, get } from "lodash/fp"

import safeDate from "../lib/safeDate"
import { audioMachine } from "../machines/audioMachine"

const NowPlaying = ({ state, onCover }) => {
  const size = useContext(ResponsiveContext)
  const { bitrate, album, artist, track, release = {}, cover } =
    get("context.meta", state) || {}
  const { mbid, releaseDate } = release || {}

  const artworkSize = size === "small" ? "xsmall" : "small"
  const releaseUrl = mbid && `https://musicbrainz.org/release/${mbid}`
  const coverUrl = cover
    ? cover
    : mbid
    ? `https://coverartarchive.org/release/${mbid}/front-500`
    : null

  useEffect(() => {
    if (coverUrl) {
      onCover(true)
    } else {
      onCover(false)
    }
  }, [coverUrl])

  return (
    <Box pad="small" align="center" background="dark-1">
      {state.matches("offline") && (
        <>
          <Box direction="row" gap="small" align="center">
            <Unlink color="black" />
            <Heading margin="none" level={2}>
              Offline :(
            </Heading>
          </Box>
          <Heading margin="none" level={4}>
            Nobody's broadcasting right now.
          </Heading>
        </>
      )}
      {state.matches("ready") && (
        <Anchor href={releaseUrl} target="_blank">
          <Box direction="row" gap="small" justify="center">
            {coverUrl && state.matches("ready.cover.found") ? (
              <Box width={artworkSize} height={artworkSize}>
                <Image
                  onError={() => {
                    onCover(false)
                  }}
                  height="small"
                  width="small"
                  src={coverUrl}
                />
              </Box>
            ) : (
              <Box
                background="light-2"
                width={artworkSize}
                height={artworkSize}
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
        </Anchor>
      )}
    </Box>
  )
}

export default NowPlaying
