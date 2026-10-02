import { Badge, Box, HStack, Image, Stack, Text } from "@chakra-ui/react"
import SegmentNotesMarkdown from "../../../SegmentNotesMarkdown"
import type { RoadTripSiteDetailComponentProps } from "../../../../types/PluginComponent"
import {
  DEFAULT_TRIP_KEY,
  SITE_STATE_LABEL,
  formatClock,
  formatMiles,
  useTripStore,
} from "./tripView"

/** Site detail on the Game State nav stack: art, name, description, lore once visited (D12a). */
export function RoadTripSiteDetailTemplateComponent({
  siteId,
  tripKey = DEFAULT_TRIP_KEY,
}: RoadTripSiteDetailComponentProps) {
  const trip = useTripStore(tripKey)
  const site = trip?.sites.find((s) => s.id === siteId)

  if (!trip || !site || site.state === "unrevealed") {
    return (
      <Text fontSize="sm" color="fg.muted">
        Nothing to see here yet.
      </Text>
    )
  }

  const visited = site.visitedAt !== undefined

  return (
    <Stack gap={4}>
      {site.imageUrl ? (
        <Image
          src={site.imageUrl}
          alt=""
          w="full"
          maxH="220px"
          objectFit="cover"
          borderRadius="md"
        />
      ) : null}
      <HStack gap={3} align="start">
        {site.icon ? (
          <Text as="span" fontSize="3xl" lineHeight={1} aria-hidden>
            {site.icon}
          </Text>
        ) : null}
        <Stack gap={1} flex={1} minW={0}>
          <Text fontWeight="bold" fontSize="lg">
            {site.name}
          </Text>
          <HStack gap={2} flexWrap="wrap">
            <Badge>{SITE_STATE_LABEL[site.state]}</Badge>
            <Text fontSize="xs" color="fg.muted">
              mile {formatMiles(site.mile)}
              {visited ? ` · Visited ${formatClock(site.visitedAt!)}` : ""}
            </Text>
          </HStack>
        </Stack>
      </HStack>
      {site.description ? <Text fontSize="sm">{site.description}</Text> : null}
      {site.shopTitle ? (
        <Text fontSize="sm" color="fg.muted">
          🛒 {site.shopTitle}
        </Text>
      ) : null}
      {visited ? (
        site.lore ? (
          <Box fontSize="sm">
            <SegmentNotesMarkdown content={site.lore} />
          </Box>
        ) : null
      ) : (
        <Text fontSize="sm" color="fg.muted">
          🔒 Stop here to learn more
        </Text>
      )}
    </Stack>
  )
}
