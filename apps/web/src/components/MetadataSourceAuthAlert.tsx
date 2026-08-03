import { Alert, Box, Text, VStack } from "@chakra-ui/react"
import { useIsAdmin } from "../hooks/useActors"
import { metadataSourceLabel } from "../lib/metadataSourceLabels"
import ButtonRoomAuthSpotify from "./ButtonRoomAuthSpotify"

type Props = {
  /** Metadata source ids that failed auth (e.g. spotify). */
  sources: string[]
}

/**
 * In-room CTA when a room-creator OAuth token is expired/revoked during search/browse.
 */
export default function MetadataSourceAuthAlert({ sources }: Props) {
  const isAdmin = useIsAdmin()
  if (sources.length === 0) return null

  const labels = sources.map(metadataSourceLabel)
  const serviceName = sources[0] ?? "spotify"
  const labelList =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`

  return (
    <Alert.Root status="warning" variant="subtle" borderRadius="md">
      <Alert.Indicator />
      <Box flex="1">
        <VStack align="stretch" gap={2}>
          <Text fontSize="sm">
            {isAdmin
              ? `${labelList} needs to be re-linked to search and browse this catalog.`
              : `The room host's ${labelList} account was disconnected. Ask them to re-link it.`}
          </Text>
          {isAdmin && (
            <ButtonRoomAuthSpotify serviceName={serviceName} forceRelink hideText />
          )}
        </VStack>
      </Box>
    </Alert.Root>
  )
}
