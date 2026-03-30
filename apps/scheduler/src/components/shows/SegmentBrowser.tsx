import { Box, Heading, Input, VStack, HStack, Button, Text, Menu, Portal } from "@chakra-ui/react"
import { ChevronDown } from "lucide-react"
import { getRouteApi } from "@tanstack/react-router"
import type { SegmentFilters, SegmentStatus } from "@repo/types"
import { useSegments } from "../../hooks/useSegments"
import { TagCombobox } from "../tags/TagCombobox"
import { SegmentBrowserCard } from "./SegmentBrowserCard"

const showDetailRouteApi = getRouteApi("/shows/$showId")

interface SegmentBrowserProps {
  excludeSegmentIds?: string[]
  /** Appends a segment to the end of the show timeline (used for mobile quick-add). */
  onAddSegmentToShowEnd?: (segmentId: string) => void
  isAddToShowPending?: boolean
}

type ScheduledFilter = "all" | "scheduled" | "unscheduled"

type DetailSearch = ReturnType<typeof showDetailRouteApi.useSearch>

const SEGMENT_STATUSES: SegmentStatus[] = ["draft", "ready", "archived"]

const STATUS_FILTER_LABELS: Record<SegmentStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  archived: "Archived",
}

const SCHEDULED_FILTER_LABELS: Record<ScheduledFilter, string> = {
  all: "All",
  scheduled: "Scheduled",
  unscheduled: "New",
}

function mergeSegmentBrowserSearch(
  prev: DetailSearch,
  patch: Partial<{
    segSearch: string | undefined
    segTags: string[] | undefined
    recurringOnly: boolean | undefined
    scheduled: ScheduledFilter | undefined
    segStatus: SegmentStatus | undefined
  }>,
): DetailSearch {
  const segSearch = "segSearch" in patch ? patch.segSearch : prev.segSearch
  const segTags = "segTags" in patch ? patch.segTags : prev.segTags
  const recurringOnly = "recurringOnly" in patch ? patch.recurringOnly : prev.recurringOnly
  const scheduled = "scheduled" in patch ? patch.scheduled : prev.scheduled
  const segStatus = "segStatus" in patch ? patch.segStatus : prev.segStatus

  const out: DetailSearch = {}
  if (segSearch) out.segSearch = segSearch
  if (segTags && segTags.length > 0) out.segTags = segTags
  if (recurringOnly) out.recurringOnly = true
  if (scheduled && scheduled !== "all") out.scheduled = scheduled
  if (segStatus) out.segStatus = segStatus
  return out
}

export function SegmentBrowser({
  excludeSegmentIds = [],
  onAddSegmentToShowEnd,
  isAddToShowPending,
}: SegmentBrowserProps) {
  const search = showDetailRouteApi.useSearch()
  const navigate = showDetailRouteApi.useNavigate()

  const scheduledFilter: ScheduledFilter = search.scheduled ?? "all"
  const recurringOnly = search.recurringOnly === true
  const selectedTagIds = search.segTags ?? []
  const segSearchText = search.segSearch ?? ""
  const statusFilter = search.segStatus as SegmentStatus | undefined

  const filters: SegmentFilters = {
    search: segSearchText || undefined,
    tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    isRecurring: recurringOnly ? true : undefined,
    scheduled: scheduledFilter === "all" ? undefined : scheduledFilter,
    status: statusFilter,
  }

  const { data: segments = [] } = useSegments(filters)

  const visibleSegments = segments.filter((s) => !excludeSegmentIds.includes(s.id))

  function updateSearch(patch: Parameters<typeof mergeSegmentBrowserSearch>[1]) {
    navigate({
      search: (prev: DetailSearch) => mergeSegmentBrowserSearch(prev, patch),
      replace: true,
    })
  }

  return (
    <Box bg="bg.subtle" p={4} borderRadius="md">
      <Heading size="md" mb={3}>
        Segment Browser
      </Heading>

      <VStack gap={4} align="stretch" mb={3}>
        <Input
          placeholder="Search segments..."
          value={segSearchText}
          onChange={(e) => updateSearch({ segSearch: e.target.value || undefined })}
          size="sm"
        />

        <TagCombobox
          tagType="segment"
          label="Filter by tags"
          value={selectedTagIds}
          allowCreate={false}
          onValueChange={(next) => updateSearch({ segTags: next.length > 0 ? next : [] })}
        />

        <HStack gap={3}>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={recurringOnly}
              onChange={(e) => updateSearch({ recurringOnly: e.target.checked ? true : false })}
            />
            Recurring only
          </label>
        </HStack>

        <HStack gap={2} flexWrap="wrap" align="center">
          <Menu.Root
            lazyMount
            closeOnSelect
            positioning={{ placement: "bottom-start", gutter: 4 }}
          >
            <Menu.Trigger asChild>
              <Button
                type="button"
                size="xs"
                variant="outline"
                borderRadius="full"
                colorPalette={scheduledFilter === "all" ? "gray" : "blue"}
                fontWeight="medium"
                aria-label={`Schedule filter: ${SCHEDULED_FILTER_LABELS[scheduledFilter]}`}
              >
                <HStack gap={1} align="center">
                  <Text as="span" fontSize="xs" color="fg.muted" fontWeight="normal">
                    Schedule
                  </Text>
                  <Text as="span" fontSize="xs">
                    {SCHEDULED_FILTER_LABELS[scheduledFilter]}
                  </Text>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden />
                </HStack>
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner zIndex="dropdown">
                <Menu.Content minW="9rem">
                  {(["all", "scheduled", "unscheduled"] as const).map((val) => (
                    <Menu.Item
                      key={val}
                      value={val}
                      onClick={() => updateSearch({ scheduled: val })}
                      bg={scheduledFilter === val ? "bg.subtle" : undefined}
                    >
                      {SCHEDULED_FILTER_LABELS[val]}
                    </Menu.Item>
                  ))}
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>

          <Menu.Root
            lazyMount
            closeOnSelect
            positioning={{ placement: "bottom-start", gutter: 4 }}
          >
            <Menu.Trigger asChild>
              <Button
                type="button"
                size="xs"
                variant="outline"
                borderRadius="full"
                colorPalette={statusFilter === undefined ? "gray" : "blue"}
                fontWeight="medium"
                aria-label={`Status filter: ${statusFilter === undefined ? "All" : STATUS_FILTER_LABELS[statusFilter]}`}
              >
                <HStack gap={1} align="center">
                  <Text as="span" fontSize="xs" color="fg.muted" fontWeight="normal">
                    Status
                  </Text>
                  <Text as="span" fontSize="xs">
                    {statusFilter === undefined ? "All" : STATUS_FILTER_LABELS[statusFilter]}
                  </Text>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden />
                </HStack>
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner zIndex="dropdown">
                <Menu.Content minW="9rem">
                  <Menu.Item
                    value="__all__"
                    onClick={() => updateSearch({ segStatus: undefined })}
                    bg={statusFilter === undefined ? "bg.subtle" : undefined}
                  >
                    All
                  </Menu.Item>
                  {SEGMENT_STATUSES.map((val) => (
                    <Menu.Item
                      key={val}
                      value={val}
                      onClick={() => updateSearch({ segStatus: val })}
                      bg={statusFilter === val ? "bg.subtle" : undefined}
                    >
                      {STATUS_FILTER_LABELS[val]}
                    </Menu.Item>
                  ))}
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        </HStack>
      </VStack>

      <VStack gap={2} align="stretch" maxH="60vh" bg="bg.panel" p="4" overflowY="auto">
        {visibleSegments.length === 0 ? (
          <Text fontSize="sm" color="fg.muted" textAlign="center" p={4}>
            No segments match your filters
          </Text>
        ) : (
          visibleSegments.map((seg) => (
            <SegmentBrowserCard
              key={seg.id}
              segment={seg}
              onAppendToShowEnd={
                onAddSegmentToShowEnd ? () => onAddSegmentToShowEnd(seg.id) : undefined
              }
              isAppendPending={isAddToShowPending}
            />
          ))
        )}
      </VStack>
    </Box>
  )
}
