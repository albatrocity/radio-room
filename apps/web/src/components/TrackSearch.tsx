import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useMachine } from "@xstate/react"
import {
  Badge,
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

import { useSocketMachine } from "../hooks/useSocketMachine"
import { TRACK_SEARCH_EVENT_TYPES, trackSearchMachine } from "../machines/trackSearchMachine"
import { createDebouncedInputMachine } from "../machines/debouncedInputMachine"
import { takeTopByTitleRelevance } from "@repo/utils"
import type { MetadataSourceTrack, MetadataSourceTrackWithSource } from "@repo/types"
import { metadataSourceLabel } from "../lib/metadataSourceLabels"
import EntityThumb from "./EntityThumb"
import MetadataSourceAuthAlert from "./MetadataSourceAuthAlert"
import TrackActionRow from "./TrackActionRow"
import { stopTrackPreview, toggleTrackPreview } from "../actors/trackPreviewActor"
import { useTrackPreviewStatus } from "../hooks/useActors"
import { trackPreviewKey } from "../lib/trackPreviewKey"
import type { CatalogBrowseNavigation } from "./CatalogBrowse"

/** Search hits carry their own `source`; this only guards a malformed payload. */
const SEARCH_FALLBACK_SOURCE = "unknown"

type Props = {
  onChoose: (item: MetadataSourceTrack) => void
  onOpenBrowse?: (nav: CatalogBrowseNavigation) => void
  /** Controlled source filter (`all` or a metadata source id). */
  sourceFilter?: string
  /** True while the search input has a non-empty query (for dimming sibling UI). */
  onSearchActiveChange?: (isActive: boolean) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  /** Stretch result lists to fill a flex parent (Add to Queue modal). */
  fillHeight?: boolean
}

function SearchTrackRow({
  track,
  disabled,
  isActive,
  optionId,
  onChoose,
  onActivate,
  rowRef,
}: {
  track: MetadataSourceTrackWithSource
  disabled?: boolean
  isActive: boolean
  optionId: string
  onChoose: () => void
  onActivate: () => void
  rowRef: (el: HTMLDivElement | null) => void
}) {
  const previewKey = trackPreviewKey(track, SEARCH_FALLBACK_SOURCE)
  const previewStatus = useTrackPreviewStatus(previewKey)
  return (
    <TrackActionRow
      track={track}
      size="track"
      disabled={disabled}
      previewStatus={previewStatus}
      canPreview={track.source === "local"}
      onPreview={() =>
        toggleTrackPreview({
          trackKey: previewKey,
          trackId: track.id,
          source: track.source ?? "local",
        })
      }
      onAddToQueue={onChoose}
      isActive={isActive}
      optionId={optionId}
      role="option"
      aria-selected={isActive}
      onMouseEnter={onActivate}
      rowRef={rowRef}
    />
  )
}

function TrackSearch({
  onChoose,
  onOpenBrowse,
  sourceFilter = "all",
  onSearchActiveChange,
  placeholder = "Search for a track",
  disabled = false,
  autoFocus = true,
  fillHeight = false,
}: Props) {
  const listboxId = useId()
  const [state, send] = useSocketMachine(trackSearchMachine, undefined, TRACK_SEARCH_EVENT_TYPES)
  const [resultTab, setResultTab] = useState<"tracks" | "artists" | "albums">("tracks")
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    return () => stopTrackPreview()
  }, [])

  const handleSearchChange = useCallback(
    (value: string) => {
      if (value && value !== "") {
        send({ type: "FETCH_RESULTS", value })
      }
    },
    [send],
  )

  const debounceMachine = useMemo(
    () => createDebouncedInputMachine(handleSearchChange),
    [handleSearchChange],
  )

  const [inputState, inputSend] = useMachine(debounceMachine)
  const searchValue = inputState.context.value ?? ""
  const hasQuery = searchValue.trim() !== ""

  const results = state.context.results as MetadataSourceTrackWithSource[]
  const filteredResults = useMemo(() => {
    if (sourceFilter === "all") return results
    return results.filter((track) => track.source === sourceFilter)
  }, [results, sourceFilter])

  const query = searchValue.trim()
  const { artists: entityArtists, albums: entityAlbums } = useMemo(() => {
    const artistsRaw = state.context.artists ?? []
    const albumsRaw = state.context.albums ?? []
    const artistsFiltered =
      sourceFilter === "all" ? artistsRaw : artistsRaw.filter((a) => a.source === sourceFilter)
    const albumsFiltered =
      sourceFilter === "all" ? albumsRaw : albumsRaw.filter((a) => a.source === sourceFilter)

    if (sourceFilter === "all") {
      return {
        artists: takeTopByTitleRelevance(query, artistsFiltered, 5),
        albums: takeTopByTitleRelevance(query, albumsFiltered, 5),
      }
    }
    return { artists: artistsFiltered, albums: albumsFiltered }
  }, [state.context.artists, state.context.albums, sourceFilter, query])

  useEffect(() => {
    onSearchActiveChange?.(hasQuery)
  }, [hasQuery, onSearchActiveChange])

  useEffect(() => {
    setActiveIndex(-1)
    setResultTab("tracks")
  }, [sourceFilter, query])

  useEffect(() => {
    if (activeIndex < 0) return
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const chooseTrack = useCallback(
    (track: MetadataSourceTrackWithSource) => {
      onChoose(track)
      setActiveIndex(-1)
    },
    [onChoose],
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || resultTab !== "tracks") return

    if (event.key === "ArrowDown") {
      if (!hasQuery || filteredResults.length === 0) return
      event.preventDefault()
      setActiveIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : 0))
      return
    }

    if (event.key === "ArrowUp") {
      if (!hasQuery || filteredResults.length === 0) return
      event.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredResults.length - 1))
      return
    }

    if (event.key === "Enter") {
      if (activeIndex < 0 || activeIndex >= filteredResults.length) return
      event.preventDefault()
      const track = filteredResults[activeIndex]
      if (track) chooseTrack(track)
      return
    }

    if (event.key === "Escape") {
      if (activeIndex >= 0) {
        event.preventDefault()
        event.stopPropagation()
        setActiveIndex(-1)
      }
    }
  }

  const isLoading = state.matches("loading")
  const showResults = hasQuery
  const showEntityTabs = Boolean(onOpenBrowse)
  const authErrors = state.context.authErrors ?? []
  const authErrorSources = useMemo(() => {
    const sources = authErrors.map((e) => e.source).filter(Boolean)
    if (sourceFilter === "all") return sources
    return sources.filter((s) => s === sourceFilter)
  }, [authErrors, sourceFilter])
  const hasAnyResults =
    filteredResults.length > 0 || entityArtists.length > 0 || entityAlbums.length > 0
  const activeOptionId =
    resultTab === "tracks" && activeIndex >= 0 && filteredResults[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined

  const tracksList = (
    <VStack
      id={listboxId}
      role="listbox"
      aria-label="Track search results"
      align="stretch"
      gap={0}
      w="100%"
      minW={0}
      overflow="hidden"
    >
      {filteredResults.length === 0 && !isLoading ? (
        <Text fontSize="sm" color="fg.muted" py={2} px={2}>
          No tracks found
          {sourceFilter !== "all" ? ` in ${metadataSourceLabel(sourceFilter)}` : ""}.
        </Text>
      ) : (
        filteredResults.map((track, index) => (
          <SearchTrackRow
            key={`${track.source ?? SEARCH_FALLBACK_SOURCE}-${track.id}-${index}`}
            track={track}
            disabled={disabled}
            isActive={index === activeIndex}
            optionId={`${listboxId}-option-${index}`}
            onChoose={() => chooseTrack(track)}
            onActivate={() => setActiveIndex(index)}
            rowRef={(el) => {
              optionRefs.current[index] = el
            }}
          />
        ))
      )}
    </VStack>
  )

  const artistsList = (
    <VStack align="stretch" gap={0} w="100%" minW={0} overflow="hidden">
      {entityArtists.length === 0 && !isLoading ? (
        <Text fontSize="sm" color="fg.muted" py={2} px={2}>
          No artists found.
        </Text>
      ) : (
        entityArtists.map((artist) => (
          <Button
            key={`artist-${artist.source}-${artist.id}`}
            type="button"
            variant="ghost"
            disabled={disabled || !onOpenBrowse}
            justifyContent="flex-start"
            h="auto"
            w="100%"
            p={2}
            textAlign="left"
            _hover={{ bg: "actionBgLite" }}
            onClick={() =>
              onOpenBrowse?.({
                source: artist.source ?? "spotify",
                artistId: artist.id,
                artistTitle: artist.title,
              })
            }
          >
            <HStack justify="space-between" w="100%" minW={0} gap={2}>
              <HStack gap={2} minW={0} flex={1}>
                <EntityThumb images={artist.images} shape="circle" alt="" size="track" />
                <Text fontWeight="medium" truncate>
                  {artist.title}
                </Text>
              </HStack>
              {artist.source && (
                <Badge size="sm" variant="subtle" flexShrink={0}>
                  {metadataSourceLabel(artist.source)}
                </Badge>
              )}
            </HStack>
          </Button>
        ))
      )}
    </VStack>
  )

  const albumsList = (
    <VStack align="stretch" gap={0} w="100%" minW={0} overflow="hidden">
      {entityAlbums.length === 0 && !isLoading ? (
        <Text fontSize="sm" color="fg.muted" py={2} px={2}>
          No albums found.
        </Text>
      ) : (
        entityAlbums.map((album) => (
          <Button
            key={`album-${album.source}-${album.id}`}
            type="button"
            variant="ghost"
            disabled={disabled || !onOpenBrowse}
            justifyContent="flex-start"
            h="auto"
            w="100%"
            p={2}
            textAlign="left"
            _hover={{ bg: "actionBgLite" }}
            onClick={() =>
              onOpenBrowse?.({
                source: album.source ?? "spotify",
                albumId: album.id,
                albumTitle: album.title,
                artistId: album.artists?.[0]?.id,
                artistTitle: album.artists?.[0]?.title,
              })
            }
          >
            <HStack justify="space-between" w="100%" minW={0} gap={2}>
              <HStack gap={2} minW={0} flex={1}>
                <EntityThumb images={album.images} shape="square" alt="" size="track" />
                <VStack align="start" gap={0} minW={0}>
                  <Text fontWeight="medium" truncate>
                    {album.title}
                  </Text>
                  {album.artists?.[0]?.title && (
                    <Text fontSize="xs" color="fg.muted" truncate>
                      {album.artists[0].title}
                    </Text>
                  )}
                </VStack>
              </HStack>
              {album.source && (
                <Badge size="sm" variant="subtle" flexShrink={0}>
                  {metadataSourceLabel(album.source)}
                </Badge>
              )}
            </HStack>
          </Button>
        ))
      )}
    </VStack>
  )

  return (
    <VStack
      align="stretch"
      gap={3}
      w="100%"
      minW={0}
      overflowX="hidden"
      {...(fillHeight ? { flex: "1", minH: 0, h: "100%" } : {})}
    >
      {state.matches("failure") && (
        <Text color="red.500" fontSize="sm">
          {state.context.error?.message ?? "Search failed"}
        </Text>
      )}

      <Input
        placeholder={placeholder}
        value={searchValue}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => inputSend({ type: "SET_VALUE", value: e.target.value })}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        flexShrink={0}
      />

      {showResults && authErrorSources.length > 0 && (
        <MetadataSourceAuthAlert sources={authErrorSources} />
      )}

      {showResults && (
        <Box
          minW={0}
          overflowX="hidden"
          {...(fillHeight ? { flex: "1", minH: 0, display: "flex", flexDirection: "column" } : {})}
        >
          {isLoading && !hasAnyResults && authErrorSources.length === 0 ? (
            <Center py={6}>
              <Spinner size="sm" />
            </Center>
          ) : showEntityTabs ? (
            <Tabs.Root
              value={resultTab}
              onValueChange={(details) => {
                setResultTab(details.value as "tracks" | "artists" | "albums")
                setActiveIndex(-1)
              }}
              variant="line"
              colorPalette="action"
              size="sm"
              {...(fillHeight
                ? { flex: "1", minH: 0, display: "flex", flexDirection: "column" }
                : {})}
            >
              <Tabs.List flexShrink={0}>
                <Tabs.Trigger value="tracks">Tracks</Tabs.Trigger>
                <Tabs.Trigger value="artists">Artists</Tabs.Trigger>
                <Tabs.Trigger value="albums">Albums</Tabs.Trigger>
              </Tabs.List>
              <ScrollArea.Root
                size="sm"
                variant="hover"
                w="100%"
                minW={0}
                mt={2}
                overflowX="hidden"
                {...(fillHeight
                  ? { flex: "1 1 auto", minH: 0, height: "100%" }
                  : { maxH: "320px" })}
              >
                <ScrollArea.Viewport
                  minW={0}
                  overflowX="hidden"
                  {...(fillHeight ? { height: "100%" } : {})}
                >
                  <ScrollArea.Content minW={0} maxW="100%">
                    <Tabs.Content value="tracks" pt={0}>
                      {tracksList}
                    </Tabs.Content>
                    <Tabs.Content value="artists" pt={0}>
                      {artistsList}
                    </Tabs.Content>
                    <Tabs.Content value="albums" pt={0}>
                      {albumsList}
                    </Tabs.Content>
                  </ScrollArea.Content>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar>
                  <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
                <ScrollArea.Corner />
              </ScrollArea.Root>
            </Tabs.Root>
          ) : (
            <ScrollArea.Root
              size="sm"
              variant="hover"
              w="100%"
              minW={0}
              overflowX="hidden"
              {...(fillHeight ? { flex: "1 1 auto", minH: 0, height: "100%" } : { maxH: "320px" })}
            >
              <ScrollArea.Viewport minW={0} overflowX="hidden" {...(fillHeight ? { height: "100%" } : {})}>
                <ScrollArea.Content minW={0} maxW="100%">
                  {tracksList}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar>
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
              <ScrollArea.Corner />
            </ScrollArea.Root>
          )}
          {isLoading && hasAnyResults && (
            <Center py={2}>
              <Spinner size="xs" />
            </Center>
          )}
        </Box>
      )}
    </VStack>
  )
}

export default TrackSearch
