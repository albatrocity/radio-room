import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Box,
  createListCollection,
  HStack,
  Portal,
  Select,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react"
import TrackSearch from "./TrackSearch"
import CatalogBrowse, { type CatalogBrowseNavigation } from "./CatalogBrowse"
import type { MetadataSourceTrack } from "@repo/types"
import { filterMetadataSourcesByBridgeCapability } from "@repo/utils"
import {
  useBrowseableMetadataSourceIds,
  useBrowseSourceCapabilities,
  useCurrentRoom,
  useEffectiveMetadataSourceIds,
  useMediaBridgeConnected,
  useMediaBridgeServices,
} from "../hooks/useActors"
import { metadataSourceLabel } from "../lib/metadataSourceLabels"

type Props = {
  onAddToQueue: (track: MetadataSourceTrack) => void
  isDisabled?: boolean
  onSearchActiveChange?: (isActive: boolean) => void
}

type Mode = "search" | "browse"

const FormAddToQueue = ({ onAddToQueue, isDisabled, onSearchActiveChange }: Props) => {
  const room = useCurrentRoom()
  const bridgeConnected = useMediaBridgeConnected()
  const bridgeServices = useMediaBridgeServices()
  const effectiveSourceIds = useEffectiveMetadataSourceIds()
  const browseableSourceIds = useBrowseableMetadataSourceIds()
  const browseSourceCapabilities = useBrowseSourceCapabilities()
  const [mode, setMode] = useState<Mode>("search")
  const [browseNav, setBrowseNav] = useState<CatalogBrowseNavigation | null>(null)
  const [sourceFilter, setSourceFilter] = useState("all")

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

  const canBrowse = (browseableSourceIds?.length ?? 0) > 0

  useEffect(() => {
    if (!canBrowse && mode === "browse") {
      setMode("search")
    }
  }, [canBrowse, mode])

  useEffect(() => {
    if (mode === "browse") {
      onSearchActiveChange?.(true)
    }
  }, [mode, onSearchActiveChange])

  // Keep source selection valid for the active mode
  useEffect(() => {
    if (mode === "browse") {
      const browseSources = browseableSourceIds ?? []
      if (sourceFilter !== "all" && browseSources.includes(sourceFilter)) return
      if (browseSources[0]) setSourceFilter(browseSources[0])
      return
    }
    if (sourceFilter === "all") return
    if (!metadataSourceIds.includes(sourceFilter)) {
      setSourceFilter("all")
    }
  }, [mode, sourceFilter, browseableSourceIds, metadataSourceIds])

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

  const handleSelect = (track: MetadataSourceTrack) => {
    onAddToQueue(track)
  }

  const handleOpenBrowse = useCallback((nav: CatalogBrowseNavigation) => {
    setSourceFilter(nav.source)
    setBrowseNav(nav)
    setMode("browse")
  }, [])

  const clearBrowseNav = useCallback(() => {
    setBrowseNav(null)
  }, [])

  const handleModeChange = (next: Mode) => {
    if (next === "browse") {
      const browseSources = browseableSourceIds ?? []
      if (sourceFilter === "all" || !browseSources.includes(sourceFilter)) {
        const fallback = browseSources[0]
        if (fallback) setSourceFilter(fallback)
      }
    }
    setMode(next)
  }

  return (
    <Stack direction="column" gap={2} textStyle="body">
      <Text as="p" fontSize="sm">
        Selecting a song will send it to the room creator's play queue, where they can choose to
        leave it in, reorder it, or remove it completely.
      </Text>

      {(canBrowse || showSourceSelect) && (
        <HStack gap={3} align="center" justify="space-between" flexWrap="wrap">
          {canBrowse ? (
            <Tabs.Root
              value={mode}
              onValueChange={(details) => handleModeChange(details.value as Mode)}
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
                if (next) setSourceFilter(next)
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
      <Box hidden={mode !== "search"} aria-hidden={mode !== "search"}>
        <TrackSearch
          onChoose={handleSelect}
          onOpenBrowse={canBrowse ? handleOpenBrowse : undefined}
          sourceFilter={sourceFilter}
          placeholder="Search for an artist, album, or track"
          disabled={isDisabled}
          onSearchActiveChange={mode === "search" ? onSearchActiveChange : undefined}
          autoFocus={mode === "search"}
        />
      </Box>

      {canBrowse && (
        <Box hidden={mode !== "browse"} aria-hidden={mode !== "browse"}>
          <CatalogBrowse
            browseableSourceIds={browseableSourceIds ?? []}
            browseSourceCapabilities={browseSourceCapabilities}
            sourceId={sourceFilter === "all" ? browseableSourceIds?.[0] ?? "" : sourceFilter}
            onSourceIdChange={setSourceFilter}
            initialNavigation={browseNav}
            onNavigationApplied={clearBrowseNav}
            onChoose={handleSelect}
            disabled={isDisabled}
          />
        </Box>
      )}
    </Stack>
  )
}

export default FormAddToQueue
