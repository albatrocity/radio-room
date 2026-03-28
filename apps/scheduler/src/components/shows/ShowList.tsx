import { useState } from "react"
import { Box, Button, Heading, HStack, Text, Badge, VStack } from "@chakra-ui/react"
import { getRouteApi, Link } from "@tanstack/react-router"
import { Plus, CalendarDays } from "lucide-react"
import type { ShowFilters as ShowFiltersType, ShowStatus } from "@repo/types"
import { useShows } from "../../hooks/useShows"
import { ShowFilters } from "./ShowFilters"
import { CreateShowModal } from "./CreateShowModal"

const showsRouteApi = getRouteApi("/shows/")

const STATUS_COLORS: Record<ShowStatus, string> = {
  draft: "yellow",
  ready: "green",
  published: "blue",
}

function showFiltersFromSearch(
  search: ReturnType<typeof showsRouteApi.useSearch>,
): ShowFiltersType {
  return {
    search: search.search,
    startDate: search.startDate,
    endDate: search.endDate,
    status: search.status,
  }
}

export function ShowList() {
  const search = showsRouteApi.useSearch()
  const navigate = showsRouteApi.useNavigate()
  const filters = showFiltersFromSearch(search)
  const [createOpen, setCreateOpen] = useState(false)
  const { data: shows = [], isLoading } = useShows(filters)

  function setFilters(next: ShowFiltersType) {
    navigate({
      to: "/shows",
      search: {
        ...(next.search ? { search: next.search } : {}),
        ...(next.startDate ? { startDate: next.startDate } : {}),
        ...(next.endDate ? { endDate: next.endDate } : {}),
        ...(next.status ? { status: next.status } : {}),
      },
      replace: true,
    })
  }

  return (
    <Box>
      <HStack justify="space-between" mb={4}>
        <Heading size="lg">Shows</Heading>
        <Button colorPalette="blue" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          New Show
        </Button>
      </HStack>

      <Box mb={4}>
        <ShowFilters filters={filters} onChange={setFilters} />
      </Box>

      {isLoading ? (
        <Box>Loading shows...</Box>
      ) : shows.length === 0 ? (
        <Box p={8} textAlign="center" color="fg.muted">
          <Text>No shows found. Create your first show to get started.</Text>
        </Box>
      ) : (
        <VStack gap={2} align="stretch">
          {shows.map((show) => (
            <Link key={show.id} to="/shows/$showId" params={{ showId: show.id }}>
              <Box
                borderWidth="1px"
                borderColor="border.muted"
                borderRadius="md"
                p={4}
                _hover={{ borderColor: "border.emphasized", bg: "bg.subtle" }}
                transition="all 0.15s"
                cursor="pointer"
              >
                <HStack justify="space-between" mb={1}>
                  <HStack gap={3}>
                    <Heading size="sm">{show.title}</Heading>
                    <Badge colorPalette={STATUS_COLORS[show.status]} size="sm">
                      {show.status}
                    </Badge>
                  </HStack>
                  {show.tags && show.tags.length > 0 && (
                    <HStack gap={1}>
                      {show.tags.map((tag) => (
                        <Badge key={tag.id} size="sm" variant="subtle">
                          {tag.name}
                        </Badge>
                      ))}
                    </HStack>
                  )}
                </HStack>
                <HStack gap={4} color="fg.muted" fontSize="sm">
                  <HStack gap={1}>
                    <CalendarDays size={14} />
                    <Text>
                      {new Date(show.startTime).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      {new Date(show.startTime).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {show.endTime && (
                        <>
                          {" - "}
                          {new Date(show.endTime).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </>
                      )}
                    </Text>
                  </HStack>
                  {show.description && <Text lineClamp={1}>{show.description}</Text>}
                </HStack>
              </Box>
            </Link>
          ))}
        </VStack>
      )}

      <CreateShowModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  )
}
