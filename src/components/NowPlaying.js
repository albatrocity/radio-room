import React, { useContext, useEffect, memo, useMemo } from "react"
import { Box, Heading, Text, Image, ResponsiveContext, Anchor } from "grommet"
import { Music, Unlink } from "grommet-icons"
import { isEmpty, get } from "lodash/fp"

import AlbumArtwork from "./AlbumArtwork"

import safeDate from "../lib/safeDate"
import { audioMachine } from "../machines/audioMachine"

const NowPlaying = ({ onCover, ready, offline, meta, coverFound }) => {
  const size = useContext(ResponsiveContext)
  const { bitrate, album, artist, track, release = {}, cover } = meta || {}
  const { mbid, releaseDate } = release || {}
  const artworkSize = size === "small" ? "xsmall" : "small"
  const releaseUrl = mbid && `https://musicbrainz.org/release/${mbid}`
  const coverUrl = useMemo(
    () =>
      cover
        ? cover
        : mbid
        ? `https://coverartarchive.org/release/${mbid}/front-500`
        : null,
    [mbid, cover]
  )

  useEffect(() => {
    if (coverUrl) {
      onCover(true)
    } else {
      onCover(false)
    }
  }, [coverUrl])

  const MetaWrapper = ({ releaseUrl, children }) =>
    releaseUrl ? (
      <Anchor href={releaseUrl} target="_blank" color="white">
        {children}
      </Anchor>
    ) : (
      <>{children}</>
    )

  return (
    <Box pad="medium" align="center" background="accent-1">
      {offline && (
        <>
          <Box direction="row" gap="small" align="center">
            <Unlink color="white" />
            <Heading margin="none" level={2} color="white">
              Offline :(
            </Heading>
          </Box>
          <Heading margin="none" level={4} textAlign="center" color="white">
            Nobody's broadcasting right now.
          </Heading>
        </>
      )}
      {ready && (
        <MetaWrapper href={releaseUrl} target="_blank" color="white">
          <Box direction="row" gap="medium" justify="center">
            {coverUrl && coverFound ? (
              <Box
                width={artworkSize}
                height={artworkSize}
                flex={{ shrink: 0, grow: 1 }}
              >
                <AlbumArtwork coverUrl={coverUrl} onCover={onCover} />
              </Box>
            ) : (
              <Box
                background="accent-4"
                width={artworkSize}
                height={artworkSize}
                align="center"
                justify="center"
                flex={{ shrink: 0, grow: 1 }}
              >
                <Music size="large" color="accent-1" />
              </Box>
            )}
            <Box justify="center">
              {track && (
                <Heading color="accent-4" margin="none" level={3}>
                  {track}
                </Heading>
              )}
              {artist && (
                <Heading color="accent-4" margin="none" level={4}>
                  {artist}
                </Heading>
              )}
              {album && (
                <Text color="accent-4" margin="none" size="small">
                  {album}
                </Text>
              )}
              {releaseDate && (
                <Text color="accent-4" size="xsmall">
                  Released {safeDate(releaseDate)}
                </Text>
              )}
            </Box>
          </Box>
        </MetaWrapper>
      )}
    </Box>
  )
}

export default memo(NowPlaying)
