import { Badge, HStack } from "@chakra-ui/react"
import type { TrackRoomPresence } from "../lib/trackRoomPresence"

type Props = {
  presence: TrackRoomPresence
}

export function TrackPresenceBadges({ presence }: Props) {
  if (!presence.inQueue && !presence.alreadyPlayed) {
    return null
  }

  return (
    <HStack gap={1} flexShrink={0} flexWrap="wrap" align="center" justify="flex-end">
      {presence.inQueue ? (
        <Badge size="xs" variant="subtle" colorPalette="orange">
          In Queue
        </Badge>
      ) : null}
      {presence.alreadyPlayed ? (
        <Badge size="xs" variant="subtle" colorPalette="gray">
          Already Played
        </Badge>
      ) : null}
    </HStack>
  )
}
