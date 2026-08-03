import { useEffect, useState } from "react"
import { Stack, Text, Tabs } from "@chakra-ui/react"
import TrackSearch from "./TrackSearch"
import CatalogBrowse from "./CatalogBrowse"
import { MetadataSourceTrack } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors"
import { useCurrentRoom, useMediaBridgeConnected, useMediaBridgeServices } from "../hooks/useActors"

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
  const [mode, setMode] = useState<Mode>("search")
  const [browseableSourceIds, setBrowseableSourceIds] = useState<string[] | null>(null)

  useEffect(() => {
    const subscriptionId = `form-add-to-queue-browse-${Date.now()}`
    subscribeById(subscriptionId, {
      send: (event: {
        type: string
        data?: { browseableSourceIds?: string[]; effectiveMetadataSourceIds?: string[] }
      }) => {
        if (event.type === "EFFECTIVE_METADATA_SOURCES" && Array.isArray(event.data?.browseableSourceIds)) {
          setBrowseableSourceIds(event.data.browseableSourceIds)
        }
        if (event.type === "INIT" && Array.isArray(event.data?.browseableSourceIds)) {
          setBrowseableSourceIds(event.data.browseableSourceIds)
        }
        if (event.type === "ROOM_SETTINGS_UPDATED") {
          emitToSocket("GET_EFFECTIVE_METADATA_SOURCES", {})
        }
      },
    })
    emitToSocket("GET_EFFECTIVE_METADATA_SOURCES", {})
    return () => unsubscribeById(subscriptionId)
  }, [
    room?.metadataSourceIds,
    room?.metadataSourceAccess,
    room?.playbackControllerId,
    bridgeConnected,
    bridgeServices,
  ])

  const canBrowse = (browseableSourceIds?.length ?? 0) > 0

  useEffect(() => {
    if (!canBrowse && mode === "browse") {
      setMode("search")
    }
  }, [canBrowse, mode])

  useEffect(() => {
    // Hide SavedTracks while browsing (same as active search)
    if (mode === "browse") {
      onSearchActiveChange?.(true)
    }
  }, [mode, onSearchActiveChange])

  const handleSelect = (track: MetadataSourceTrack) => {
    onAddToQueue(track)
  }

  return (
    <Stack direction="column" gap={2} textStyle="body">
      <Text as="p" fontSize="sm">
        Selecting a song will send it to the room creator's play queue, where they can choose to
        leave it in, reorder it, or remove it completely.
      </Text>

      {canBrowse && (
        <Tabs.Root
          value={mode}
          onValueChange={(details) => setMode(details.value as Mode)}
          variant="enclosed"
          colorPalette="action"
          size="sm"
        >
          <Tabs.List>
            <Tabs.Trigger value="search">Search</Tabs.Trigger>
            <Tabs.Trigger value="browse">Browse</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      )}

      {mode === "browse" && canBrowse ? (
        <CatalogBrowse
          browseableSourceIds={browseableSourceIds ?? []}
          onChoose={handleSelect}
          disabled={isDisabled}
        />
      ) : (
        <TrackSearch
          onChoose={handleSelect}
          placeholder="Search for a track"
          disabled={isDisabled}
          onSearchActiveChange={mode === "search" ? onSearchActiveChange : undefined}
          autoFocus
        />
      )}
    </Stack>
  )
}

export default FormAddToQueue
