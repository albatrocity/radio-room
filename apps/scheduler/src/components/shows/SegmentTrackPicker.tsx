import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Box,
  Button,
  CloseButton,
  Drawer,
  HStack,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { DragDropProvider, DragOverlay, type DragEndEvent } from "@dnd-kit/react"
import { move } from "@dnd-kit/helpers"
import type { MetadataSourceTrack } from "@repo/types/MetadataSource"
import type { ShowSegmentTrackDTO } from "@repo/types"
import {
  useSaveShowSegmentTracks,
  useSpotifyTrackSearch,
} from "../../hooks/useShowSegmentTracks"
import {
  MetadataPlaylistTrackDragPreview,
  MetadataPlaylistTrackRow,
  MetadataPlaylistSearchResultRow,
} from "../tracks/MetadataPlaylistTrackRow"

type DragEndPayload = Parameters<DragEndEvent>[0]

type DraftRow = { id: string; track: MetadataSourceTrack }

function rowsFromTracks(tracks: MetadataSourceTrack[]): DraftRow[] {
  return tracks.map((track) => ({ id: crypto.randomUUID(), track }))
}

function tracksFromShowSegmentRows(rows: ShowSegmentTrackDTO[]): MetadataSourceTrack[] {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => row.trackPayload)
    .filter((t): t is MetadataSourceTrack => t != null)
}

interface SegmentTrackPickerProps {
  showId: string
  showSegmentId: string
  segmentTitle: string
  initialTracks: ShowSegmentTrackDTO[]
  open: boolean
  readOnly?: boolean
  onClose: () => void
}

export function SegmentTrackPicker({
  showId,
  showSegmentId,
  segmentTitle,
  initialTracks,
  open,
  readOnly = false,
  onClose,
}: SegmentTrackPickerProps) {
  const [rows, setRows] = useState<DraftRow[]>([])
  const [searchDraft, setSearchDraft] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  const saveTracks = useSaveShowSegmentTracks(showId)
  const search = useSpotifyTrackSearch(debouncedQuery)

  useEffect(() => {
    if (!open) return
    setRows(rowsFromTracks(tracksFromShowSegmentRows(initialTracks)))
    setSearchDraft("")
    setDebouncedQuery("")
  }, [open, showSegmentId, initialTracks])

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(searchDraft), 300)
    return () => window.clearTimeout(handle)
  }, [searchDraft])

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows])
  const selectedTrackIds = useMemo(() => new Set(rows.map((r) => r.track.id)), [rows])

  const handleDragEnd = useCallback(
    (event: DragEndPayload) => {
      if (event.canceled || readOnly) return
      const newIds = move(rowIds, event)
      const byId = new Map(rows.map((r) => [r.id, r]))
      setRows(newIds.map((id) => byId.get(id)!).filter(Boolean))
    },
    [readOnly, rowIds, rows],
  )

  function handleAddTrack(track: MetadataSourceTrack) {
    if (selectedTrackIds.has(track.id)) return
    setRows((prev) => [...prev, { id: crypto.randomUUID(), track }])
  }

  function handleRemove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleSave() {
    await saveTracks.mutateAsync({
      showSegmentId,
      tracks: rows.map((r) => r.track),
    })
    onClose()
  }

  const searchError =
    search.error instanceof Error
      ? search.error.message
      : search.isError
        ? "Search failed"
        : null

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose()
      }}
      placement="end"
      size="md"
    >
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Segment tracks</Drawer.Title>
            <Drawer.CloseTrigger asChild position="absolute" top="3" right="3">
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Header>

          <Drawer.Body display="flex" flexDirection="column" gap={4} minH={0}>
            <Text fontSize="sm" color="fg.muted">
              {segmentTitle}
            </Text>

            {!readOnly && (
              <Box>
                <Input
                  placeholder="Search Spotify…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  size="sm"
                />
                {searchDraft.trim().length >= 2 && (
                  <Box mt={2} maxH="180px" overflowY="auto">
                    {search.isLoading ? (
                      <HStack py={2}>
                        <Spinner size="sm" />
                        <Text fontSize="sm">Searching…</Text>
                      </HStack>
                    ) : searchError ? (
                      <Text fontSize="sm" color="red.500">
                        {searchError}
                      </Text>
                    ) : (search.data?.length ?? 0) === 0 ? (
                      <Text fontSize="sm" color="fg.muted">
                        No results
                      </Text>
                    ) : (
                      <VStack align="stretch" gap={2}>
                        {search.data?.map((track) => (
                          <MetadataPlaylistSearchResultRow
                            key={track.id}
                            track={track}
                            alreadyAdded={selectedTrackIds.has(track.id)}
                            onAdd={() => handleAddTrack(track)}
                          />
                        ))}
                      </VStack>
                    )}
                  </Box>
                )}
              </Box>
            )}

            <Text fontSize="sm" fontWeight="medium">
              Tracks ({rows.length})
            </Text>

            {rows.length === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                No tracks attached to this segment placement yet.
              </Text>
            ) : (
              <DragDropProvider onDragEnd={handleDragEnd}>
                <Box flex="1" minH={0} overflowY="auto">
                  <VStack align="stretch" gap={2}>
                    {rows.map((row, index) => (
                      <MetadataPlaylistTrackRow
                        key={row.id}
                        sortableId={row.id}
                        index={index}
                        track={row.track}
                        readOnly={readOnly}
                        onRemove={readOnly ? undefined : () => handleRemove(row.id)}
                      />
                    ))}
                  </VStack>
                </Box>
                {!readOnly && (
                  <DragOverlay dropAnimation={null}>
                    {(source) => {
                      const id = source?.id != null ? String(source.id) : null
                      const row = id ? rows.find((r) => r.id === id) : undefined
                      return row ? <MetadataPlaylistTrackDragPreview track={row.track} /> : null
                    }}
                  </DragOverlay>
                )}
              </DragDropProvider>
            )}
          </Drawer.Body>

          <Drawer.Footer>
            <HStack justify="flex-end" w="full" gap={2}>
              <Button variant="ghost" onClick={onClose}>
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button
                  colorPalette="blue"
                  loading={saveTracks.isPending}
                  onClick={() => void handleSave()}
                >
                  Save
                </Button>
              )}
            </HStack>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  )
}
