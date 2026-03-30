import { useState, useMemo } from "react"
import { Box, Button, Flex, HStack, Heading } from "@chakra-ui/react"
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

type SegmentsSearch = ReturnType<typeof segmentsRouteApi.useSearch>

const COLUMNS: SegmentStatus[] = ["draft", "ready", "archived"]

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
  const drawerSegmentId = search.segmentId

  const columns = useMemo(() => {
    const grouped: Record<SegmentStatus, SegmentDTO[]> = {
      draft: [],
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
    <Flex direction="column" flex="1" minH="0">
      <HStack justify="space-between" mb={4} flexShrink={0}>
        <Heading size="lg">Segments</Heading>
        <Button colorPalette="blue" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          New Segment
        </Button>
      </HStack>

      {tags.length > 0 && (
        <HStack gap={2} mb={4} flexWrap="wrap" flexShrink={0}>
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
                    search: (prev: SegmentsSearch) => {
                      if (next.length > 0) {
                        return { ...prev, tags: next }
                      }
                      const { tags: _tags, ...rest } = prev
                      return rest
                    },
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
                navigate({
                  to: "/segments",
                  search: (prev: SegmentsSearch) => {
                    const { tags: _tags, ...rest } = prev
                    return rest
                  },
                  replace: true,
                })
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
        <Flex direction="column" flex="1" minH="0" overflow="hidden">
          <DragDropProvider onDragEnd={handleDragEnd}>
            <Flex flex="1" minH="0" overflow="hidden" direction="column">
              <HStack gap={3} align="stretch" flex="1" minH="0" overflowX="auto" overflowY="hidden">
                {COLUMNS.map((status) => (
                  <SegmentColumn
                    key={status}
                    status={status}
                    segments={columns[status]}
                    onCardClick={(seg) =>
                      navigate({
                        to: "/segments",
                        search: (prev: SegmentsSearch) => ({ ...prev, segmentId: seg.id }),
                        replace: true,
                      })
                    }
                  />
                ))}
              </HStack>
            </Flex>
            <DragOverlay dropAnimation={null} style={{ flex: "none" }}>
              {(source) => {
                const seg = segmentFromSource(source)
                return seg ? <SegmentCard segment={seg} onClick={() => {}} isDragOverlay /> : null
              }}
            </DragOverlay>
          </DragDropProvider>
        </Flex>
      )}

      <CreateSegmentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <SegmentDetailDrawer
        segmentId={drawerSegmentId}
        open={!!drawerSegmentId}
        onClose={() =>
          navigate({
            to: "/segments",
            search: (prev: SegmentsSearch) => {
              const { segmentId: _segmentId, ...rest } = prev
              return rest
            },
            replace: true,
          })
        }
      />
    </Flex>
  )
}
