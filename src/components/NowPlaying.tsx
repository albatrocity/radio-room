import React, { useContext, useEffect, memo, useMemo } from "react"
import { Box, Heading, Text, ResponsiveContext, Anchor } from "grommet"
import { Music, Unlink } from "grommet-icons"

import AlbumArtwork from "./AlbumArtwork"

import safeDate from "../lib/safeDate"
import { TrackMeta } from "../types/Track"

interface NowPlayingProps {
  onCover: (showCover: boolean) => void
  offline: boolean
  meta: TrackMeta
  coverFound: boolean
}

const NowPlaying = ({
  onCover,
  offline,
  meta,
  coverFound,
}: NowPlayingProps) => {
  const size = useContext(ResponsiveContext)
  const {
    album,
    artist,
    track,
    release = { mbid: undefined, releaseDate: undefined },
    cover,
    title,
  } = meta || {}
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
    [mbid, cover],
  )

  useEffect(() => {
    if (coverUrl) {
      onCover(true)
    } else {
      onCover(false)
    }
  }, [coverUrl])

  const MetaWrapper = ({
    releaseUrl,
    children,
  }: {
    releaseUrl: string
    children: JSX.Element
  }) =>
    releaseUrl ? (
      <Anchor href={releaseUrl} target="_blank" color="white">
        {children}
      </Anchor>
    ) : (
      <>{children}</>
    )

  return (
    <Box pad="medium" align="center" background="accent-1">
      {offline ? (
        <>
          <Box direction="row" gap="small" align="center">
            <Unlink color="white" />
            <Heading margin="none" level={2} color="white">
              Offline :(
            </Heading>
          </Box>
        </>
      ) : (
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
              {(track || title) && (
                <Heading color="accent-4" margin="none" level={3}>
                  {track || title.replace(/\|/g, "")}
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
