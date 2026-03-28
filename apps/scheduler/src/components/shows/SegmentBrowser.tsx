import { Box, Heading, Input, VStack, HStack, Button, Text } from "@chakra-ui/react"
import { getRouteApi } from "@tanstack/react-router"
import type { SegmentFilters } from "@repo/types"
import { useSegments } from "../../hooks/useSegments"
import { TagCombobox } from "../tags/TagCombobox"
import { SegmentBrowserCard } from "./SegmentBrowserCard"

const showDetailRouteApi = getRouteApi("/shows/$showId")

interface SegmentBrowserProps {
  excludeSegmentIds?: string[]
}

type ScheduledFilter = "all" | "scheduled" | "unscheduled"

type DetailSearch = ReturnType<typeof showDetailRouteApi.useSearch>

function mergeSegmentBrowserSearch(
  prev: DetailSearch,
  patch: Partial<{
    segSearch: string | undefined
    segTags: string[] | undefined
    recurringOnly: boolean | undefined
    scheduled: ScheduledFilter | undefined
  }>,
): DetailSearch {
  const segSearch = "segSearch" in patch ? patch.segSearch : prev.segSearch
  const segTags = "segTags" in patch ? patch.segTags : prev.segTags
  const recurringOnly = "recurringOnly" in patch ? patch.recurringOnly : prev.recurringOnly
  const scheduled = "scheduled" in patch ? patch.scheduled : prev.scheduled

  const out: DetailSearch = {}
  if (segSearch) out.segSearch = segSearch
  if (segTags && segTags.length > 0) out.segTags = segTags
  if (recurringOnly) out.recurringOnly = true
  if (scheduled && scheduled !== "all") out.scheduled = scheduled
  return out
}

export function SegmentBrowser({ excludeSegmentIds = [] }: SegmentBrowserProps) {
  const search = showDetailRouteApi.useSearch()
  const navigate = showDetailRouteApi.useNavigate()

  const scheduledFilter: ScheduledFilter = search.scheduled ?? "all"
  const recurringOnly = search.recurringOnly === true
  const selectedTagIds = search.segTags ?? []
  const segSearchText = search.segSearch ?? ""

  const filters: SegmentFilters = {
    search: segSearchText || undefined,
    tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    isRecurring: recurringOnly ? true : undefined,
    scheduled: scheduledFilter === "all" ? undefined : scheduledFilter,
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
    <Box>
      <Heading size="sm" mb={3}>
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

        <HStack gap={1}>
          {(["all", "scheduled", "unscheduled"] as const).map((val) => (
            <Button
              key={val}
              size="xs"
              variant={scheduledFilter === val ? "solid" : "outline"}
              colorPalette={scheduledFilter === val ? "blue" : "gray"}
              onClick={() => updateSearch({ scheduled: val })}
            >
              {val === "all" ? "All" : val === "scheduled" ? "Scheduled" : "New"}
            </Button>
          ))}
        </HStack>
      </VStack>

      <VStack gap={2} align="stretch" maxH="60vh" bg="bg.panel" p="4" overflowY="auto">
        {visibleSegments.length === 0 ? (
          <Text fontSize="sm" color="fg.muted" textAlign="center" p={4}>
            No segments match your filters
          </Text>
        ) : (
          visibleSegments.map((seg) => <SegmentBrowserCard key={seg.id} segment={seg} />)
        )}
      </VStack>
    </Box>
  )
}
