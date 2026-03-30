import { useCallback, useEffect, useMemo, useState } from "react"
import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Spinner,
  Text,
  AbsoluteCenter,
} from "@chakra-ui/react"
import { DragDropProvider, DragOverlay, type DragEndEvent } from "@dnd-kit/react"
import { isSortable } from "@dnd-kit/react/sortable"
import { move } from "@dnd-kit/helpers"
import { queueItemStableKey, type QueueItem } from "@repo/types/Queue"
import { PublishPlaylistList } from "../../components/tracks/PublishPlaylistList"
import { PlaylistTrackDragPreview } from "../../components/tracks/PlaylistTrackRow"
import { useContinuePublish, useSyncPublishPlaylist } from "../../hooks/usePublishShow"
import { ManagedOverflowContainer } from "../../components/layout/ManagedOverflowContainer"

type DragEndPayload = Parameters<DragEndEvent>[0]

type Row = { id: string; item: QueueItem }

function rowsFromItems(items: QueueItem[]): Row[] {
  return items.map((item) => ({ id: crypto.randomUUID(), item }))
}

export const Route = createFileRoute("/shows/$showId/publish/playlist")({
  component: PublishPlaylistPage,
})

function PublishPlaylistPage() {
  const { showId } = Route.useParams()
  const navigate = useNavigate()
  const navState = useRouterState({
    select: (s) => s.location.state as { playlistItems?: QueueItem[] } | undefined,
  })

  const [rows, setRows] = useState<Row[]>([])
  const [bootDone, setBootDone] = useState(false)

  const sync = useSyncPublishPlaylist(showId)
  const continuePublish = useContinuePublish(showId)

  const hydrateFromItems = useCallback((items: QueueItem[]) => {
    setRows(rowsFromItems(items))
  }, [])

  useEffect(() => {
    const fromNav = navState?.playlistItems
    if (fromNav !== undefined) {
      hydrateFromItems(fromNav)
      setBootDone(true)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const data = await sync.mutateAsync()
        if (!cancelled) {
          hydrateFromItems(data.playlistItems)
        }
      } catch {
        /* useSyncPublishPlaylist surfaces errors via toaster */
      } finally {
        if (!cancelled) {
          setBootDone(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // Intentionally only re-run when navigation state’s playlist payload changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState?.playlistItems])

  const trackIds = useMemo(() => rows.map((r) => r.id), [rows])

  function handleDragEnd(event: DragEndPayload) {
    if (event.canceled) return
    const newIds = move(trackIds, event)
    const byId = new Map(rows.map((r) => [r.id, r]))
    setRows(newIds.map((id) => byId.get(id)!).filter(Boolean))
  }

  function handleRemove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  function handleResync() {
    sync.mutate(undefined, {
      onSuccess: (data) => hydrateFromItems(data.playlistItems),
    })
  }

  if (!bootDone) {
    return (
      <ManagedOverflowContainer>
        <Flex flex="1" minH={0} position="relative">
          <AbsoluteCenter>
            <Spinner />
          </AbsoluteCenter>
        </Flex>
      </ManagedOverflowContainer>
    )
  }

  return (
    <ManagedOverflowContainer>
      <Flex direction="column" flex="1" minH={0} minW={0} gap={4}>
        <Box flexShrink={0}>
          <HStack justify="space-between" flexWrap="wrap" gap={2}>
            <Heading size="lg">Review playlist</Heading>
            <HStack gap={2}>
              <Link to="/shows/$showId" params={{ showId }}>
                <Button variant="ghost" size="sm">
                  Back to show
                </Button>
              </Link>
              <Button variant="outline" size="sm" loading={sync.isPending} onClick={handleResync}>
                Resync from room
              </Button>
            </HStack>
          </HStack>

          <Text fontSize="sm" color="fg.muted" mt={2}>
            Reorder or remove tracks. Changes stay in the browser until you continue — nothing is saved
            to the archive until the next step.
          </Text>
        </Box>

        <DragDropProvider onDragEnd={handleDragEnd}>
          <Flex direction="column" flex="1" minH={0} minW={0} overflow="hidden">
            {rows.length === 0 ? (
              <Box
                py={10}
                textAlign="center"
                borderWidth="1px"
                borderStyle="dashed"
                borderRadius="md"
                borderColor="border.muted"
                flexShrink={0}
              >
                <Text color="fg.muted" fontSize="sm">
                  No tracks in the room playlist. You can still continue to generate an empty archive
                  or resync after tracks play.
                </Text>
              </Box>
            ) : (
              <PublishPlaylistList rows={rows} onRemove={handleRemove} />
            )}
          </Flex>
          <DragOverlay dropAnimation={null}>
            {(source) => {
              if (!source || !isSortable(source)) return null
              const id = String(source.id)
              const row = rows.find((r) => r.id === id)
              if (!row) return null
              return <PlaylistTrackDragPreview item={row.item} />
            }}
          </DragOverlay>
        </DragDropProvider>

        <HStack flexShrink={0} justify="flex-end" pt={2}>
          <Button
            colorPalette="blue"
            loading={continuePublish.isPending}
            onClick={() => {
              const orderedTrackKeys = rows.map((r) => queueItemStableKey(r.item))
              continuePublish.mutate(orderedTrackKeys, {
                onSuccess: () => {
                  navigate({ to: "/shows/$showId/publish", params: { showId } })
                },
              })
            }}
          >
            Continue to Markdown
          </Button>
        </HStack>
      </Flex>
    </ManagedOverflowContainer>
  )
}
