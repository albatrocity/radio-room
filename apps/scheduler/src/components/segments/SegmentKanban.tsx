import { useState, useMemo } from "react"
import { Box, Button, HStack, Heading } from "@chakra-ui/react"
import { DragDropProvider, DragOverlay, type DragEndEvent } from "@dnd-kit/react"

type DragEndPayload = Parameters<DragEndEvent>[0]
import { getRouteApi } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import type { SegmentDTO, SegmentStatus } from "@repo/types"
import { useSegments, useUpdateSegment } from "../../hooks/useSegments"
import { useTags } from "../../hooks/useTags"
import { SegmentColumn } from "./SegmentColumn"
import { SegmentCard } from "./SegmentCard"
import { CreateSegmentModal } from "./CreateSegmentModal"
import { SegmentDetailDrawer } from "./SegmentDetailDrawer"

const segmentsRouteApi = getRouteApi("/segments")

const COLUMNS: SegmentStatus[] = ["draft", "working", "ready", "archived"]

type SegmentDragData = { segment: SegmentDTO }

function segmentFromSource(source: { data: unknown } | null | undefined): SegmentDTO | undefined {
  if (!source) return undefined
  const data = source.data as SegmentDragData | undefined
  return data?.segment
}

export function SegmentKanban() {
  const search = segmentsRouteApi.useSearch()
  const navigate = segmentsRouteApi.useNavigate()
  const selectedTagIds = search.tags ?? []
  const { data: segments = [], isLoading } = useSegments(
    selectedTagIds.length > 0 ? { tags: selectedTagIds } : {},
  )
  const { data: tags = [] } = useTags("segment")
  const updateSegment = useUpdateSegment()

  const [createOpen, setCreateOpen] = useState(false)
  const [drawerSegmentId, setDrawerSegmentId] = useState<string | null>(null)

  const columns = useMemo(() => {
    const grouped: Record<SegmentStatus, SegmentDTO[]> = {
      draft: [],
      working: [],
      ready: [],
      archived: [],
    }
    for (const seg of segments) {
      grouped[seg.status]?.push(seg)
    }
    return grouped
  }, [segments])

  function handleDragEnd(event: DragEndPayload) {
    if (event.canceled) return

    const { source, target } = event.operation
    if (!source || !target) return

    const targetStatus = target.id as SegmentStatus
    if (!COLUMNS.includes(targetStatus)) return

    const data = source.data as SegmentDragData | undefined
    const seg = data?.segment
    if (!seg || seg.status === targetStatus) return

    updateSegment.mutate({ id: seg.id, status: targetStatus })
  }

  return (
    <Box>
      <HStack justify="space-between" mb={4}>
        <Heading size="lg">Segments</Heading>
        <Button colorPalette="blue" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          New Segment
        </Button>
      </HStack>

      {tags.length > 0 && (
        <HStack gap={2} mb={4} flexWrap="wrap">
          {tags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id)
            return (
              <Button
                key={tag.id}
                size="xs"
                variant={selected ? "solid" : "outline"}
                colorPalette={selected ? "blue" : "gray"}
                onClick={() => {
                  const next = selected
                    ? selectedTagIds.filter((id: string) => id !== tag.id)
                    : [...selectedTagIds, tag.id]
                  navigate({
                    to: "/segments",
                    search: next.length > 0 ? { tags: next } : {},
                    replace: true,
                  })
                }}
              >
                {tag.name}
              </Button>
            )
          })}
          {selectedTagIds.length > 0 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                navigate({ to: "/segments", search: {}, replace: true })
              }
            >
              Clear
            </Button>
          )}
        </HStack>
      )}

      {isLoading ? (
        <Box>Loading segments...</Box>
      ) : (
        <DragDropProvider onDragEnd={handleDragEnd}>
          <HStack gap={3} align="start" overflowX="auto" pb={4}>
            {COLUMNS.map((status) => (
              <SegmentColumn
                key={status}
                status={status}
                segments={columns[status]}
                onCardClick={(seg) => setDrawerSegmentId(seg.id)}
              />
            ))}
          </HStack>
          <DragOverlay dropAnimation={null}>
            {(source) => {
              const seg = segmentFromSource(source)
              return seg ? (
                <SegmentCard segment={seg} onClick={() => {}} isDragOverlay />
              ) : null
            }}
          </DragOverlay>
        </DragDropProvider>
      )}

      <CreateSegmentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <SegmentDetailDrawer
        segmentId={drawerSegmentId}
        open={!!drawerSegmentId}
        onClose={() => setDrawerSegmentId(null)}
      />
    </Box>
  )
}
