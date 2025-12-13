import { Button, Card, Heading, Text, VStack, HStack, Box } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { LuUsers } from "react-icons/lu"
import { QueueItem } from "@repo/types"
import { Room } from "../types/Room"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import TrackDisplay from "./TrackDisplay"

type Props = Omit<Room, "password"> & {
  userCount?: number
  nowPlaying?: QueueItem | null
  creatorName?: string
}

export default function CardRoomPublic({
  title,
  extraInfo,
  id,
  creatorName,
  userCount = 0,
  nowPlaying,
}: Props) {
  return (
    <Card.Root>
      <Card.Header>
        <VStack align="stretch" gap={1}>
          <Heading size="md">{title}</Heading>
          {creatorName && (
            <Text fontSize="sm" color="fg.muted">
              by {creatorName}
            </Text>
          )}
        </VStack>
      </Card.Header>
      <Card.Body>
        <VStack gap={3} align="stretch">
          {extraInfo && <ParsedEmojiMessage content={extraInfo} />}

          {/* Now Playing */}
          {nowPlaying && (
            <Box p={2} bg="bg.subtle" borderRadius="md">
              <TrackDisplay item={nowPlaying} />
            </Box>
          )}

          {/* User count */}
          <HStack gap={1} color="fg.muted">
            <LuUsers size={14} />
            <Text fontSize="sm">
              {userCount} {userCount === 1 ? "listener" : "listeners"}
            </Text>
          </HStack>

          <Button asChild>
            <Link to="/rooms/$roomId" params={{ roomId: id }}>
              Join
            </Link>
          </Button>
        </VStack>
      </Card.Body>
    </Card.Root>
  )
}
