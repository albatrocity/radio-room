import { useCallback, useEffect, useLayoutEffect, useMemo } from "react"
import {
  Box,
  createListCollection,
  HStack,
  Portal,
  Select,
  Stack,
  Tabs,
} from "@chakra-ui/react"
import TrackSearch from "./TrackSearch"
import CatalogBrowse, { type CatalogBrowseLocation } from "./CatalogBrowse"
import type { MetadataSourceTrack } from "@repo/types"
import { filterMetadataSourcesByBridgeCapability } from "@repo/utils"
import {
  useAddToQueueUi,
  useAddToQueueUiSend,
  useBrowseableMetadataSourceIds,
  useBrowseSourceCapabilities,
  useCurrentRoom,
  useEffectiveMetadataSourceIds,
  useIsModalOpen,
  useMediaBridgeConnected,
  useMediaBridgeServices,
  useMyMedia,
  useQueueBrowseMediaKey,
} from "../hooks/useActors"
import { useTrackRoomPresence } from "../hooks/useTrackRoomPresence"
import { metadataSourceLabel } from "../lib/metadataSourceLabels"
import type {
  AddToQueueBrowseLocation,
  AddToQueueMode,
  AddToQueueNavigation,
} from "../machines/addToQueueUiMachine"

type Props = {
  onAddToQueue: (track: MetadataSourceTrack) => void
  isDisabled?: boolean
  onSearchActiveChange?: (isActive: boolean) => void
  /** Stretch Search/Browse lists to fill a flex parent (Add to Queue modal). */
  fillHeight?: boolean
}

function toBrowseLocation(location: CatalogBrowseLocation): AddToQueueBrowseLocation {
  return {
    source: location.source,
    rootKind: location.rootKind,
    level: location.level,
    ...(location.artistId ? { artistId: location.artistId, artistTitle: location.artistTitle } : {}),
    ...(location.albumId ? { albumId: location.albumId, albumTitle: location.albumTitle } : {}),
    ...(location.mediaKey ? { mediaKey: location.mediaKey } : {}),
  }
}

const FormAddToQueue = ({
  onAddToQueue,
  isDisabled,
  onSearchActiveChange,
  fillHeight = false,
}: Props) => {
  const room = useCurrentRoom()
  const bridgeConnected = useMediaBridgeConnected()
  const bridgeServices = useMediaBridgeServices()
  const effectiveSourceIds = useEffectiveMetadataSourceIds()
  const browseableSourceIds = useBrowseableMetadataSourceIds()
  const browseSourceCapabilities = useBrowseSourceCapabilities()
  const myMedia = useMyMedia()
  const queueBrowseMediaKey = useQueueBrowseMediaKey()
  const isQueueModalOpen = useIsModalOpen("queue")
  const { mode, sourceFilter, pendingNavigation, canBrowse } = useAddToQueueUi()
  const send = useAddToQueueUiSend()
  const { getPresence: getTrackPresence } = useTrackRoomPresence(isQueueModalOpen)

  const fallbackSourceIds = useMemo(() => {
    const policy = (room?.metadataSourceIds ?? []).filter(Boolean)
    if (room?.playbackControllerId !== "bridge") return policy
    const capabilitiesKnown = bridgeServices !== null
    return filterMetadataSourcesByBridgeCapability({
      metadataSourceIds: policy,
      bridgeConnected,
      capabilitiesKnown,
      availableServices: bridgeServices ?? [],
    })
  }, [room?.metadataSourceIds, room?.playbackControllerId, bridgeConnected, bridgeServices])

  const metadataSourceIds = effectiveSourceIds ?? fallbackSourceIds
  const canBrowseLocal = (browseableSourceIds ?? []).includes("local")

  useEffect(() => {
    if (browseableSourceIds === null) return
    send({
      type: "SET_CAPABILITIES",
      canBrowse: browseableSourceIds.length > 0,
      browseableSourceIds,
      metadataSourceIds,
    })
  }, [browseableSourceIds, metadataSourceIds, send])

  // Before CatalogBrowse's mount effects: re-apply saved album/artist when the dialog remounts.
  useLayoutEffect(() => {
    if (!isQueueModalOpen) return
    send({ type: "RESTORE_BROWSE_VIEW" })
  }, [isQueueModalOpen, send])

  useEffect(() => {
    if (!queueBrowseMediaKey || !canBrowseLocal) return
    send({ type: "DEEP_LINK_MEDIA", mediaKey: queueBrowseMediaKey })
  }, [queueBrowseMediaKey, canBrowseLocal, send])

  useEffect(() => {
    if (mode === "browse") {
      onSearchActiveChange?.(true)
    }
  }, [mode, onSearchActiveChange])

  const sourceCollection = useMemo(() => {
    if (mode === "browse") {
      return createListCollection({
        items: (browseableSourceIds ?? []).map((id) => ({
          label: metadataSourceLabel(id),
          value: id,
        })),
      })
    }
    return createListCollection({
      items: [
        { label: "All", value: "all" },
        ...metadataSourceIds.map((id) => ({
          label: metadataSourceLabel(id),
          value: id,
        })),
      ],
    })
  }, [mode, browseableSourceIds, metadataSourceIds])

  const showSourceSelect =
    mode === "browse" ? (browseableSourceIds?.length ?? 0) >= 2 : metadataSourceIds.length >= 2

  const handleSelect = useCallback(
    (track: MetadataSourceTrack) => {
      onAddToQueue(track)
    },
    [onAddToQueue],
  )

  // CatalogBrowse's deep-link effect (ADR 0105) depends on these, so an unstable
  // identity would re-run it on every render of this form.
  const handleSourceIdChange = useCallback(
    (id: string) => {
      send({ type: "SET_SOURCE", sourceFilter: id })
    },
    [send],
  )

  const handleNavigationApplied = useCallback(() => {
    send({ type: "NAVIGATION_APPLIED" })
  }, [send])

  const handleOpenBrowse = useCallback(
    (nav: AddToQueueNavigation) => {
      send({ type: "OPEN_BROWSE", nav })
    },
    [send],
  )

  const handleBrowseLocationChange = useCallback(
    (location: CatalogBrowseLocation) => {
      send({ type: "BROWSE_LOCATION", location: toBrowseLocation(location) })
    },
    [send],
  )

  return (
    <Stack
      direction="column"
      gap={2}
      textStyle="body"
      minW={0}
      overflowX="hidden"
      {...(fillHeight ? { flex: "1", minH: 0, h: "100%" } : {})}
    >
      {(canBrowse || showSourceSelect) && (
        <HStack gap={3} align="center" justify="space-between" flexWrap="wrap" flexShrink={0}>
          {canBrowse ? (
            <Tabs.Root
              value={mode}
              onValueChange={(details) =>
                send({ type: "SET_MODE", mode: details.value as AddToQueueMode })
              }
              variant="enclosed"
              colorPalette="action"
              size="sm"
            >
              <Tabs.List>
                <Tabs.Trigger value="search">Search</Tabs.Trigger>
                <Tabs.Trigger value="browse">Browse</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
          ) : (
            <Box />
          )}

          {showSourceSelect && (
            <Select.Root
              aria-label="Catalog source"
              collection={sourceCollection}
              size="sm"
              width="160px"
              value={[sourceFilter]}
              disabled={isDisabled}
              onValueChange={(details) => {
                const next = details.value[0]
                if (next) send({ type: "SET_SOURCE", sourceFilter: next })
              }}
              positioning={{ sameWidth: true }}
            >
              <Select.HiddenSelect />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText placeholder="Source" />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content>
                    <Select.List>
                      {sourceCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item}>
                          <Select.ItemText>{item.label}</Select.ItemText>
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          )}
        </HStack>
      )}

      {/* Keep both mounted so Search/Browse state survives mode switches (ADR 0090). */}
      <Box
        hidden={mode !== "search"}
        aria-hidden={mode !== "search"}
        minW={0}
        overflowX="hidden"
        {...(fillHeight && mode === "search"
          ? { flex: "1", minH: 0, display: "flex", flexDirection: "column" }
          : {})}
      >
        <TrackSearch
          onChoose={handleSelect}
          onOpenBrowse={canBrowse ? handleOpenBrowse : undefined}
          sourceFilter={sourceFilter}
          placeholder="Search for an artist, album, or track"
          disabled={isDisabled}
          onSearchActiveChange={mode === "search" ? onSearchActiveChange : undefined}
          autoFocus={mode === "search"}
          fillHeight={fillHeight}
          getTrackPresence={getTrackPresence}
        />
      </Box>

      {canBrowse && (
        <Box
          hidden={mode !== "browse"}
          aria-hidden={mode !== "browse"}
          {...(fillHeight && mode === "browse"
            ? { flex: "1", minH: 0, display: "flex", flexDirection: "column" }
            : {})}
        >
          <CatalogBrowse
            browseableSourceIds={browseableSourceIds ?? []}
            browseSourceCapabilities={browseSourceCapabilities}
            myMedia={myMedia}
            sourceId={sourceFilter === "all" ? browseableSourceIds?.[0] ?? "" : sourceFilter}
            onSourceIdChange={handleSourceIdChange}
            initialNavigation={pendingNavigation}
            onNavigationApplied={handleNavigationApplied}
            onBrowseLocationChange={handleBrowseLocationChange}
            onChoose={handleSelect}
            disabled={isDisabled}
            fillHeight={fillHeight}
            getTrackPresence={getTrackPresence}
          />
        </Box>
      )}
    </Stack>
  )
}

export default FormAddToQueue
