import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Box,
  Button,
  Center,
  HStack,
  Input,
  ScrollArea,
  Spinner,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import type { MetadataBrowseAlbum, MetadataBrowseArtist, MetadataSourceTrack } from "@repo/types"
import { useSocketMachine } from "../hooks/useSocketMachine"
import { catalogBrowseMachine } from "../machines/catalogBrowseMachine"
import TrackItem from "./TrackItem"

type TrackWithSource = MetadataSourceTrack & { source?: string }

const SOURCE_TAB_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  youtube: "YouTube",
  local: "Library",
}

function sourceTabLabel(sourceId: string): string {
  return SOURCE_TAB_LABELS[sourceId] ?? sourceId.charAt(0).toUpperCase() + sourceId.slice(1)
}

type BrowseLevel = "artists" | "albums" | "tracks"

type Props = {
  browseableSourceIds: string[]
  onChoose: (track: MetadataSourceTrack) => void
  disabled?: boolean
}

function CatalogBrowse({ browseableSourceIds, onChoose, disabled = false }: Props) {
  const [state, send] = useSocketMachine(catalogBrowseMachine)
  const [sourceId, setSourceId] = useState(browseableSourceIds[0] ?? "")
  const [level, setLevel] = useState<BrowseLevel>("artists")
  const [artistFilter, setArtistFilter] = useState("")
  const [selectedArtist, setSelectedArtist] = useState<MetadataBrowseArtist | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<MetadataBrowseAlbum | null>(null)
  const skipNextFilterFetch = useRef(true)

  useEffect(() => {
    if (!browseableSourceIds.includes(sourceId)) {
      setSourceId(browseableSourceIds[0] ?? "")
    }
  }, [browseableSourceIds, sourceId])

  useEffect(() => {
    if (!sourceId) return
    setLevel("artists")
    setSelectedArtist(null)
    setSelectedAlbum(null)
    setArtistFilter("")
    skipNextFilterFetch.current = true
    send({ type: "FETCH_ARTISTS", source: sourceId })
  }, [sourceId, send])

  // Debounce artist filter → server query
  useEffect(() => {
    if (!sourceId || level !== "artists") return
    if (skipNextFilterFetch.current) {
      skipNextFilterFetch.current = false
      return
    }
    const handle = window.setTimeout(() => {
      send({
        type: "FETCH_ARTISTS",
        source: sourceId,
        query: artistFilter.trim() || undefined,
      })
    }, 250)
    return () => window.clearTimeout(handle)
  }, [artistFilter, sourceId, level, send])

  const isLoading =
    state.matches("loadingArtists") ||
    state.matches("loadingArtist") ||
    state.matches("loadingAlbum")

  const artists = state.context.artists
  const albums = state.context.albums
  const tracks = state.context.tracks as TrackWithSource[]

  const breadcrumb = useMemo(() => {
    const crumbs: { label: string; onClick?: () => void }[] = [
      {
        label: "Artists",
        onClick:
          level === "artists"
            ? undefined
            : () => {
                setLevel("artists")
                setSelectedArtist(null)
                setSelectedAlbum(null)
              },
      },
    ]
    if (selectedArtist && (level === "albums" || level === "tracks")) {
      crumbs.push({
        label: selectedArtist.title,
        onClick:
          level === "albums"
            ? undefined
            : () => {
                setLevel("albums")
                setSelectedAlbum(null)
                if (sourceId) {
                  send({ type: "FETCH_ARTIST", source: sourceId, artistId: selectedArtist.id })
                }
              },
      })
    }
    if (selectedAlbum && level === "tracks") {
      crumbs.push({ label: selectedAlbum.title })
    }
    return crumbs
  }, [level, selectedArtist, selectedAlbum, sourceId, send])

  const openArtist = (artist: MetadataBrowseArtist) => {
    if (!sourceId || disabled) return
    setSelectedArtist(artist)
    setSelectedAlbum(null)
    setLevel("albums")
    send({ type: "FETCH_ARTIST", source: sourceId, artistId: artist.id })
  }

  const openAlbum = (album: MetadataBrowseAlbum) => {
    if (!sourceId || disabled) return
    setSelectedAlbum(album)
    setLevel("tracks")
    send({ type: "FETCH_ALBUM", source: sourceId, albumId: album.id })
  }

  const showSourceTabs = browseableSourceIds.length >= 2

  return (
    <VStack align="stretch" gap={3} w="100%">
      {showSourceTabs && (
        <Tabs.Root
          value={sourceId}
          onValueChange={(details) => setSourceId(details.value)}
          variant="line"
          colorPalette="action"
          size="sm"
        >
          <Tabs.List flexWrap="wrap">
            {browseableSourceIds.map((id) => (
              <Tabs.Trigger key={id} value={id}>
                {sourceTabLabel(id)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      )}

      <HStack gap={1} flexWrap="wrap" fontSize="sm">
        {breadcrumb.map((crumb, i) => (
          <HStack key={`${crumb.label}-${i}`} gap={1}>
            {i > 0 && (
              <Text color="fg.muted" aria-hidden>
                /
              </Text>
            )}
            {crumb.onClick ? (
              <Button
                type="button"
                variant="plain"
                size="xs"
                colorPalette="action"
                onClick={crumb.onClick}
                px={1}
                minW={0}
                h="auto"
              >
                {crumb.label}
              </Button>
            ) : (
              <Text fontWeight={i === breadcrumb.length - 1 ? "semibold" : "normal"}>
                {crumb.label}
              </Text>
            )}
          </HStack>
        ))}
      </HStack>

      {level === "artists" && (
        <Input
          placeholder="Filter artists"
          value={artistFilter}
          disabled={disabled}
          onChange={(e) => setArtistFilter(e.target.value)}
          size="sm"
        />
      )}

      {state.matches("failure") && (
        <Text color="red.500" fontSize="sm">
          {state.context.error?.message ?? "Browse failed"}
        </Text>
      )}

      <Box>
        {isLoading &&
        ((level === "artists" && artists.length === 0) ||
          (level === "albums" && albums.length === 0) ||
          (level === "tracks" && tracks.length === 0)) ? (
          <Center py={6}>
            <Spinner size="sm" />
          </Center>
        ) : (
          <ScrollArea.Root maxH="320px" size="sm" variant="hover" w="100%">
            <ScrollArea.Viewport>
              <ScrollArea.Content>
                <VStack align="stretch" gap={0} w="100%">
                  {level === "artists" &&
                    (artists.length === 0 ? (
                      <Text fontSize="sm" color="fg.muted" py={2}>
                        No artists found.
                      </Text>
                    ) : (
                      artists.map((artist) => (
                        <Button
                          key={artist.id}
                          type="button"
                          variant="ghost"
                          disabled={disabled}
                          justifyContent="flex-start"
                          h="auto"
                          w="100%"
                          p={2}
                          textAlign="left"
                          borderRadius="md"
                          _hover={{ bg: "actionBgLite" }}
                          onClick={() => openArtist(artist)}
                        >
                          <VStack align="start" gap={0} minW={0}>
                            <Text fontWeight="medium" truncate>
                              {artist.title}
                            </Text>
                            {artist.albumCount != null && (
                              <Text fontSize="xs" color="fg.muted">
                                {artist.albumCount} album{artist.albumCount === 1 ? "" : "s"}
                              </Text>
                            )}
                          </VStack>
                        </Button>
                      ))
                    ))}

                  {level === "albums" &&
                    (albums.length === 0 ? (
                      <Text fontSize="sm" color="fg.muted" py={2}>
                        No albums found.
                      </Text>
                    ) : (
                      albums.map((album) => (
                        <Button
                          key={album.id}
                          type="button"
                          variant="ghost"
                          disabled={disabled}
                          justifyContent="flex-start"
                          h="auto"
                          w="100%"
                          p={2}
                          textAlign="left"
                          borderRadius="md"
                          _hover={{ bg: "actionBgLite" }}
                          onClick={() => openAlbum(album)}
                        >
                          <VStack align="start" gap={0} minW={0}>
                            <Text fontWeight="medium" truncate>
                              {album.title}
                            </Text>
                            <Text fontSize="xs" color="fg.muted" truncate>
                              {[album.year, album.trackCount != null ? `${album.trackCount} tracks` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          </VStack>
                        </Button>
                      ))
                    ))}

                  {level === "tracks" &&
                    (tracks.length === 0 ? (
                      <Text fontSize="sm" color="fg.muted" py={2}>
                        No tracks found.
                      </Text>
                    ) : (
                      tracks.map((track, index) => (
                        <Button
                          key={`${track.source ?? sourceId}-${track.id}-${index}`}
                          type="button"
                          variant="ghost"
                          disabled={disabled}
                          justifyContent="flex-start"
                          h="auto"
                          w="100%"
                          minW={0}
                          overflow="hidden"
                          p={2}
                          textAlign="left"
                          borderRadius="md"
                          _hover={{ bg: "actionBgLite" }}
                          onClick={() => onChoose(track)}
                        >
                          <TrackItem {...track} />
                        </Button>
                      ))
                    ))}
                </VStack>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar>
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
            <ScrollArea.Corner />
          </ScrollArea.Root>
        )}
        {isLoading &&
          ((level === "artists" && artists.length > 0) ||
            (level === "albums" && albums.length > 0) ||
            (level === "tracks" && tracks.length > 0)) && (
            <Center py={2}>
              <Spinner size="xs" />
            </Center>
          )}
      </Box>
    </VStack>
  )
}

export default CatalogBrowse
