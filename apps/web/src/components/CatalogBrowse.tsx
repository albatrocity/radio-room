import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Box,
  Center,
  chakra,
  HStack,
  Input,
  ScrollArea,
  Spinner,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import type {
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataBrowseCapabilities,
  MetadataSourceTrack,
  MetadataSourceTrackWithSource,
  PhysicalMediaItem,
} from "@repo/types"
import { useSocketMachine } from "../hooks/useSocketMachine"
import { CATALOG_BROWSE_EVENT_TYPES, catalogBrowseMachine } from "../machines/catalogBrowseMachine"
import EntityThumb from "./EntityThumb"
import AlbumTrackListView, { type AlbumViewHeader } from "./AlbumTrackListView"
import MetadataSourceAuthAlert from "./MetadataSourceAuthAlert"
import PathBreadcrumb from "./PathBreadcrumb"
import ScrollShadowViewport from "./ScrollShadowViewport"
import { stopTrackPreview, toggleTrackPreview } from "../actors/trackPreviewActor"
import { artistsLabel, releaseYear } from "../lib/albumHeaderFields"
import { preferBrowserRenderableImages } from "../lib/metadataImages"
import type { GetTrackPresence } from "../hooks/useTrackRoomPresence"

type BrowseRowButtonProps = {
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

/**
 * Row trigger for browse lists. Deliberately a plain button rather than Chakra's
 * `Button`, whose recipe sizes every nested `svg` down to icon size and would
 * shrink artwork frame overlays.
 */
function BrowseRowButton({ disabled, onClick, children }: BrowseRowButtonProps) {
  return (
    <chakra.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      display="flex"
      alignItems="center"
      justifyContent="flex-start"
      w="100%"
      minW={0}
      h="auto"
      p={2}
      overflow="visible"
      textAlign="left"
      borderRadius="md"
      bg="transparent"
      borderWidth={0}
      color="inherit"
      fontFamily="inherit"
      fontSize="inherit"
      lineHeight="inherit"
      cursor={disabled ? "not-allowed" : "pointer"}
      opacity={disabled ? 0.6 : 1}
      _hover={disabled ? undefined : { bg: "actionBgLite" }}
    >
      {children}
    </chakra.button>
  )
}

/** Adapt a Physical Media item's cover art to the `EntityThumb` image list shape. */
function physicalMediaImages(item: PhysicalMediaItem) {
  return item.imageUrl
    ? [{ type: "image" as const, url: item.imageUrl, id: item.mediaKey }]
    : undefined
}

type BrowseLevel = "root" | "artistAlbums" | "tracks"
type RootKind = "artists" | "albums" | "media"

export type CatalogBrowseNavigation = {
  source: string
  artistId?: string
  albumId?: string
  artistTitle?: string
  albumTitle?: string
  /** Held Physical Media item to open directly (ADR 0099). */
  mediaKey?: string
  /** Root tab to open when not drilling into an artist/album/media (ADR 0105). */
  rootKind?: RootKind
}

export type CatalogBrowseLocation = {
  source: string
  rootKind: RootKind
  level: BrowseLevel
  artistId?: string
  artistTitle?: string
  albumId?: string
  albumTitle?: string
  mediaKey?: string
}

type Props = {
  browseableSourceIds: string[]
  browseSourceCapabilities?: Record<string, MetadataBrowseCapabilities>
  myMedia?: PhysicalMediaItem[]
  /** Controlled catalog source (selected in parent). */
  sourceId: string
  onSourceIdChange?: (sourceId: string) => void
  initialNavigation?: CatalogBrowseNavigation | null
  onNavigationApplied?: () => void
  /** Fires when drill-down location changes (for session restore, ADR 0105). */
  onBrowseLocationChange?: (location: CatalogBrowseLocation) => void
  onChoose: (track: MetadataSourceTrack) => void
  disabled?: boolean
  /** Stretch list scrollports to fill a flex parent (Add to Queue modal). */
  fillHeight?: boolean
  getTrackPresence?: GetTrackPresence
}

function CatalogBrowse({
  browseableSourceIds,
  browseSourceCapabilities = {},
  myMedia = [],
  sourceId,
  onSourceIdChange,
  initialNavigation = null,
  onNavigationApplied,
  onBrowseLocationChange,
  onChoose,
  disabled = false,
  fillHeight = false,
  getTrackPresence,
}: Props) {
  const [state, send] = useSocketMachine(
    catalogBrowseMachine,
    undefined,
    CATALOG_BROWSE_EVENT_TYPES,
  )
  const [level, setLevel] = useState<BrowseLevel>("root")
  const [rootKind, setRootKind] = useState<RootKind>("artists")
  const [filter, setFilter] = useState("")
  const [selectedArtist, setSelectedArtist] = useState<MetadataBrowseArtist | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<MetadataBrowseAlbum | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<PhysicalMediaItem | null>(null)
  const skipNextFilterFetch = useRef(true)
  const appliedNavKey = useRef<string | null>(null)

  useEffect(() => {
    if (level !== "tracks") {
      stopTrackPreview()
    }
  }, [level])

  const handlePreview = (track: MetadataSourceTrackWithSource, previewKey: string) => {
    toggleTrackPreview({
      trackKey: previewKey,
      trackId: track.id,
      source: track.source ?? sourceId,
      ...(selectedMedia?.mediaKey ? { mediaKey: selectedMedia.mediaKey } : {}),
    })
  }

  const caps = browseSourceCapabilities[sourceId] ?? {
    entryMode: "index" as const,
    albumSearch: false,
  }
  const albumSearch = caps.albumSearch
  const searchEntry = caps.entryMode === "search"
  const showMediaTab = sourceId === "local" && myMedia.length > 0
  const showRootTabs = (albumSearch || showMediaTab) && level === "root"

  const loadRoot = (nextSource: string, kind: RootKind, query?: string) => {
    if (kind === "media") return
    if (kind === "albums") {
      send({
        type: "FETCH_ALBUMS",
        source: nextSource,
        query: query || undefined,
        limit: 50,
      })
    } else {
      send({
        type: "FETCH_ARTISTS",
        source: nextSource,
        query: query || undefined,
      })
    }
  }

  // Source change → reset to root (unless a deep-link/restore will apply).
  // Do not depend on capability flags: modal open refreshes sources and would
  // wipe album/artist drill-down (ADR 0105).
  useEffect(() => {
    if (!sourceId) return
    if (
      initialNavigation?.source === sourceId &&
      appliedNavKey.current !== JSON.stringify(initialNavigation)
    ) {
      return
    }
    setLevel("root")
    setRootKind("artists")
    setSelectedArtist(null)
    setSelectedAlbum(null)
    setSelectedMedia(null)
    setFilter("")
    skipNextFilterFetch.current = true
    if (searchEntry) {
      // Wait for query
      return
    }
    loadRoot(sourceId, "artists")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when catalog source changes
  }, [sourceId])

  // Debounced root filter
  useEffect(() => {
    if (!sourceId || level !== "root") return
    if (skipNextFilterFetch.current) {
      skipNextFilterFetch.current = false
      return
    }
    if (searchEntry && !filter.trim()) return
    if (rootKind === "media") return
    const handle = window.setTimeout(() => {
      loadRoot(sourceId, rootKind, filter.trim() || undefined)
    }, 250)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sourceId, level, rootKind, searchEntry])

  useEffect(() => {
    if (rootKind === "media" && !showMediaTab) {
      setRootKind("artists")
      setLevel("root")
      setSelectedMedia(null)
      skipNextFilterFetch.current = true
      if (sourceId && !searchEntry) {
        loadRoot(sourceId, "artists")
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMediaTab, rootKind, sourceId, searchEntry])

  // Deep-link from Search / session restore (ADR 0105)
  useEffect(() => {
    if (!initialNavigation) return
    const key = JSON.stringify(initialNavigation)
    const {
      source,
      artistId,
      albumId,
      artistTitle,
      albumTitle,
      mediaKey,
      rootKind: navRootKind,
    } = initialNavigation

    const viewMatchesNav =
      (mediaKey != null && selectedMedia?.mediaKey === mediaKey && level === "tracks") ||
      (albumId != null && selectedAlbum?.id === albumId && level === "tracks") ||
      (artistId != null &&
        albumId == null &&
        selectedArtist?.id === artistId &&
        level === "artistAlbums") ||
      (navRootKind != null &&
        mediaKey == null &&
        albumId == null &&
        artistId == null &&
        level === "root" &&
        rootKind === navRootKind)

    if (appliedNavKey.current === key && viewMatchesNav) return
    appliedNavKey.current = key

    if (!browseableSourceIds.includes(source)) {
      onNavigationApplied?.()
      return
    }
    onSourceIdChange?.(source)
    setFilter("")
    skipNextFilterFetch.current = true

    if (mediaKey) {
      const item = myMedia.find((s) => s.mediaKey === mediaKey) ?? {
        mediaKey,
        name: "Physical Media",
      }
      setRootKind("media")
      setSelectedArtist(null)
      setSelectedAlbum(null)
      setSelectedMedia(item)
      setLevel("tracks")
      send({ type: "FETCH_MEDIA", mediaKey })
    } else if (albumId) {
      setRootKind(navRootKind === "albums" ? "albums" : "artists")
      setSelectedArtist(artistId ? { id: artistId, title: artistTitle ?? artistId } : null)
      setSelectedAlbum({
        id: albumId,
        title: albumTitle ?? albumId,
        artists: [],
      })
      setSelectedMedia(null)
      setLevel("tracks")
      send({ type: "FETCH_ALBUM", source, albumId })
    } else if (artistId) {
      setRootKind("artists")
      setSelectedArtist({ id: artistId, title: artistTitle ?? artistId })
      setSelectedAlbum(null)
      setSelectedMedia(null)
      setLevel("artistAlbums")
      send({ type: "FETCH_ARTIST", source, artistId })
    } else if (navRootKind) {
      setRootKind(navRootKind)
      setSelectedArtist(null)
      setSelectedAlbum(null)
      setSelectedMedia(null)
      setLevel("root")
      const navSearchEntry =
        (browseSourceCapabilities[source] ?? { entryMode: "index" as const }).entryMode === "search"
      if (navRootKind !== "media" && !navSearchEntry) {
        loadRoot(source, navRootKind)
      }
    }
    onNavigationApplied?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply when nav payload or view drift requires it
  }, [initialNavigation, browseableSourceIds, myMedia, send, onNavigationApplied, onSourceIdChange])

  useEffect(() => {
    if (!sourceId || !onBrowseLocationChange) return
    onBrowseLocationChange({
      source: sourceId,
      rootKind,
      level,
      ...(selectedArtist ? { artistId: selectedArtist.id, artistTitle: selectedArtist.title } : {}),
      ...(selectedAlbum ? { albumId: selectedAlbum.id, albumTitle: selectedAlbum.title } : {}),
      ...(selectedMedia ? { mediaKey: selectedMedia.mediaKey } : {}),
    })
  }, [
    sourceId,
    rootKind,
    level,
    selectedArtist,
    selectedAlbum,
    selectedMedia,
    onBrowseLocationChange,
  ])

  const isLoading =
    state.matches("loadingArtists") ||
    state.matches("loadingAlbums") ||
    state.matches("loadingArtist") ||
    state.matches("loadingAlbum") ||
    state.matches("loadingMedia")

  const artists = state.context.artists
  const rootAlbums = state.context.rootAlbums
  const artistAlbums = state.context.albums
  const tracks = state.context.tracks as MetadataSourceTrackWithSource[]

  const breadcrumb = useMemo(() => {
    const crumbs: { label: string; onClick?: () => void }[] = []
    if (level === "root") {
      crumbs.push({
        label:
          rootKind === "albums" ? "Albums" : rootKind === "media" ? "Physical Media" : "Artists",
      })
      return crumbs
    }
    if (selectedMedia) {
      crumbs.push({
        label: "Physical Media",
        onClick: () => {
          setLevel("root")
          setRootKind("media")
          setSelectedMedia(null)
          setSelectedArtist(null)
          setSelectedAlbum(null)
          skipNextFilterFetch.current = true
        },
      })
      crumbs.push({ label: selectedMedia.name })
      return crumbs
    }
    crumbs.push({
      label: selectedArtist ? "Artists" : "Albums",
      onClick: () => {
        setLevel("root")
        setSelectedArtist(null)
        setSelectedAlbum(null)
        setSelectedMedia(null)
        setRootKind(selectedArtist ? "artists" : "albums")
        skipNextFilterFetch.current = true
        if (!searchEntry || filter.trim()) {
          loadRoot(sourceId, selectedArtist ? "artists" : "albums", filter.trim() || undefined)
        }
      },
    })
    if (selectedArtist && (level === "artistAlbums" || level === "tracks")) {
      crumbs.push({
        label: selectedArtist.title,
        onClick:
          level === "artistAlbums"
            ? undefined
            : () => {
                setLevel("artistAlbums")
                setSelectedAlbum(null)
                send({ type: "FETCH_ARTIST", source: sourceId, artistId: selectedArtist.id })
              },
      })
    }
    if (selectedAlbum && level === "tracks") {
      crumbs.push({ label: selectedAlbum.title })
    }
    return crumbs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    level,
    rootKind,
    selectedArtist,
    selectedAlbum,
    selectedMedia,
    sourceId,
    searchEntry,
    filter,
    send,
  ])

  const openArtist = (artist: MetadataBrowseArtist) => {
    if (!sourceId || disabled) return
    setSelectedArtist(artist)
    setSelectedAlbum(null)
    setSelectedMedia(null)
    setLevel("artistAlbums")
    send({ type: "FETCH_ARTIST", source: sourceId, artistId: artist.id })
  }

  const openAlbum = (album: MetadataBrowseAlbum) => {
    if (!sourceId || disabled) return
    setSelectedAlbum(album)
    setSelectedMedia(null)
    setLevel("tracks")
    send({ type: "FETCH_ALBUM", source: sourceId, albumId: album.id })
  }

  const openMedia = (item: PhysicalMediaItem) => {
    if (disabled) return
    setSelectedMedia(item)
    setSelectedArtist(null)
    setSelectedAlbum(null)
    setLevel("tracks")
    send({ type: "FETCH_MEDIA", mediaKey: item.mediaKey })
  }

  const albumsForList = level === "artistAlbums" ? artistAlbums : rootAlbums
  const showEmptySearchHint =
    searchEntry && level === "root" && rootKind !== "media" && !filter.trim()
  const mediaFilter = filter.trim().toLowerCase()
  const mediaItems = mediaFilter
    ? myMedia.filter((s) => s.name.toLowerCase().includes(mediaFilter))
    : myMedia

  const browseAlbum = state.context.album ?? selectedAlbum
  const firstTrack = tracks[0]
  const albumHeader = useMemo((): AlbumViewHeader | null => {
    if (level !== "tracks") return null
    if (selectedMedia) {
      return {
        title: selectedMedia.name,
        artists: artistsLabel(firstTrack?.artists),
        year: releaseYear(firstTrack?.album?.releaseDate),
        sourceId: "local",
        images: physicalMediaImages(selectedMedia),
        imageUrl: selectedMedia.imageUrl,
        imageUrlLarge: selectedMedia.imageUrlLarge,
        artworkFrame: selectedMedia.artworkFrame,
        condition: selectedMedia.condition,
      }
    }
    if (browseAlbum) {
      const artists = artistsLabel(browseAlbum.artists) ?? artistsLabel(firstTrack?.artists)
      const year = browseAlbum.year || releaseYear(firstTrack?.album?.releaseDate)
      const images = preferBrowserRenderableImages(
        browseAlbum.images,
        firstTrack?.album?.images,
      )
      return {
        title: browseAlbum.title,
        artists,
        year,
        sourceId: sourceId || firstTrack?.source || "local",
        images,
      }
    }
    if (firstTrack) {
      return {
        title: firstTrack.album.title,
        artists: artistsLabel(firstTrack.artists),
        year: releaseYear(firstTrack.album.releaseDate),
        sourceId: firstTrack.source ?? sourceId,
        images: firstTrack.album.images,
      }
    }
    return null
  }, [level, selectedMedia, browseAlbum, firstTrack, sourceId])

  return (
    <VStack
      align="stretch"
      gap={3}
      w="100%"
      {...(fillHeight ? { flex: "1", minH: 0, h: "100%" } : {})}
    >
      {showRootTabs && (
        <Tabs.Root
          value={rootKind}
          onValueChange={(details) => {
            const kind = details.value as RootKind
            setRootKind(kind)
            skipNextFilterFetch.current = true
            setFilter("")
            setSelectedMedia(null)
            if (!searchEntry) {
              loadRoot(sourceId, kind)
            }
          }}
          variant="line"
          colorPalette="action"
          size="sm"
          flexShrink={0}
        >
          <Tabs.List>
            <Tabs.Trigger value="artists">Artists</Tabs.Trigger>
            {albumSearch && <Tabs.Trigger value="albums">Albums</Tabs.Trigger>}
            {showMediaTab && <Tabs.Trigger value="media">Physical Media</Tabs.Trigger>}
          </Tabs.List>
        </Tabs.Root>
      )}

      <PathBreadcrumb items={breadcrumb} size="xs" flexShrink={0} />

      {level === "root" && (
        <Input
          placeholder={
            searchEntry
              ? rootKind === "albums"
                ? "Search albums"
                : "Search artists"
              : rootKind === "albums"
                ? "Filter albums"
                : rootKind === "media"
                  ? "Filter your collection"
                  : "Filter artists"
          }
          value={filter}
          disabled={disabled}
          onChange={(e) => setFilter(e.target.value)}
          size="sm"
          flexShrink={0}
        />
      )}

      {state.matches("failure") && state.context.error?.status === 401 && (
        <MetadataSourceAuthAlert
          sources={[state.context.error.source ?? sourceId].filter(Boolean)}
        />
      )}

      {state.matches("failure") && state.context.error?.status !== 401 && (
        <Text color="red.500" fontSize="sm">
          {state.context.error?.message ?? "Browse failed"}
        </Text>
      )}

      {showEmptySearchHint ? (
        <Text fontSize="sm" color="fg.muted" py={4}>
          Search for artists or albums to browse this catalog.
        </Text>
      ) : level === "tracks" ? (
        <AlbumTrackListView
          header={albumHeader}
          tracks={tracks}
          loading={isLoading && tracks.length === 0}
          emptyMessage={state.matches("failure") ? undefined : "No tracks found."}
          disabled={disabled}
          defaultSourceId={sourceId}
          canPreviewTrack={(track) => (track.source ?? sourceId) === "local"}
          onPreview={handlePreview}
          onAddToQueue={onChoose}
          fillHeight={fillHeight}
          getTrackPresence={getTrackPresence}
        />
      ) : (
        <Box
          {...(fillHeight ? { flex: "1", minH: 0, display: "flex", flexDirection: "column" } : {})}
        >
          {isLoading &&
          ((level === "root" && rootKind === "artists" && artists.length === 0) ||
            (level === "root" && rootKind === "albums" && rootAlbums.length === 0) ||
            (level === "artistAlbums" && artistAlbums.length === 0)) ? (
            <Center py={6}>
              <Spinner size="sm" />
            </Center>
          ) : (
            <ScrollArea.Root
              size="sm"
              variant="hover"
              w="100%"
              {...(fillHeight ? { flex: "1 1 auto", minH: 0, height: "100%" } : { maxH: "320px" })}
            >
              <ScrollShadowViewport {...(fillHeight ? { height: "100%" } : {})}>
                <ScrollArea.Content>
                  <VStack align="stretch" gap={0} w="100%">
                    {level === "root" &&
                      rootKind === "artists" &&
                      (artists.length === 0 ? (
                        <Text fontSize="sm" color="fg.muted" py={2}>
                          No artists found.
                        </Text>
                      ) : (
                        artists.map((artist) => (
                          <BrowseRowButton
                            key={artist.id}
                            disabled={disabled}
                            onClick={() => openArtist(artist)}
                          >
                            <HStack gap={2} minW={0} w="100%" overflow="hidden">
                              <EntityThumb images={artist.images} shape="circle" size="track" />
                              <VStack align="start" gap={0} minW={0} flex="1" overflow="hidden">
                                <Text fontWeight="medium" lineClamp={2} minW={0} w="100%">
                                  {artist.title}
                                </Text>
                                {artist.albumCount != null && (
                                  <Text fontSize="xs" color="fg.muted">
                                    {artist.albumCount} album{artist.albumCount === 1 ? "" : "s"}
                                  </Text>
                                )}
                              </VStack>
                            </HStack>
                          </BrowseRowButton>
                        ))
                      ))}

                    {level === "root" &&
                      rootKind === "media" &&
                      (mediaItems.length === 0 ? (
                        <Text fontSize="sm" color="fg.muted" py={2}>
                          No records in your collection.
                        </Text>
                      ) : (
                        <>
                          <Text fontSize="xs" color="fg.muted" px={2} py={1}>
                            Yours until the game session ends.
                          </Text>
                          {mediaItems.map((item) => (
                            <BrowseRowButton
                              key={item.mediaKey}
                              disabled={disabled}
                              onClick={() => openMedia(item)}
                            >
                              <HStack gap={2} minW={0} w="100%" overflow="hidden">
                                <EntityThumb
                                  images={physicalMediaImages(item)}
                                  shape="square"
                                  alt={item.name}
                                  artworkFrame={item.artworkFrame}
                                  condition={item.condition}
                                  size="track"
                                />
                                <VStack align="start" gap={0} minW={0} flex="1" overflow="hidden">
                                  <Text fontWeight="medium" lineClamp={2} minW={0} w="100%">
                                    {item.name}
                                  </Text>
                                </VStack>
                              </HStack>
                            </BrowseRowButton>
                          ))}
                        </>
                      ))}

                    {((level === "root" && rootKind === "albums") || level === "artistAlbums") &&
                      (albumsForList.length === 0 ? (
                        <Text fontSize="sm" color="fg.muted" py={2}>
                          No albums found.
                        </Text>
                      ) : (
                        albumsForList.map((album) => (
                          <BrowseRowButton
                            key={album.id}
                            disabled={disabled}
                            onClick={() => openAlbum(album)}
                          >
                            <HStack gap={2} minW={0} w="100%" overflow="hidden">
                              <EntityThumb images={album.images} shape="square" size="track" />
                              <VStack align="start" gap={0} minW={0} flex="1" overflow="hidden">
                                <Text fontWeight="medium" lineClamp={2} minW={0} w="100%">
                                  {album.title}
                                </Text>
                                <Text fontSize="xs" color="fg.muted" lineClamp={1} minW={0} w="100%">
                                  {[
                                    album.artists?.[0]?.title,
                                    album.year,
                                    album.trackCount != null ? `${album.trackCount} tracks` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </Text>
                              </VStack>
                            </HStack>
                          </BrowseRowButton>
                        ))
                      ))}
                  </VStack>
                </ScrollArea.Content>
              </ScrollShadowViewport>
              <ScrollArea.Scrollbar>
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
              <ScrollArea.Corner />
            </ScrollArea.Root>
          )}
        </Box>
      )}
    </VStack>
  )
}

export default CatalogBrowse
