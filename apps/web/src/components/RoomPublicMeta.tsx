import { Button, Card, Heading, Text, VStack, HStack, Box, Wrap } from "@chakra-ui/react"
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
  onJoin?: () => void
}

export default function RoomPublicMeta({
  title,
  extraInfo,
  id,
  userCount = 0,
  nowPlaying,
  onJoin,
}: Props) {
  return (
    <VStack>
      <HStack gap={2}>
        <Heading size="md" color="colorPalette.subtle">
          {title}
        </Heading>
        <HStack gap={1} color="colorPalette.subtle">
          <LuUsers size={14} />
          <Text color="colorPalette.subtle" fontSize="sm">
            {userCount} {userCount === 1 ? "listener" : "listeners"}
          </Text>
        </HStack>
      </HStack>
      {extraInfo && <ParsedEmojiMessage content={extraInfo} />}

      {/* Now Playing */}
      {nowPlaying && (
        <Box p={2} bg="colorPalette.subtle" borderRadius="md">
          <TrackDisplay item={nowPlaying} />
        </Box>
      )}

      <Button asChild borderColor="colorPalette.focusRing">
        <Link
          to="/rooms/$roomId"
          params={{ roomId: id }}
          onClick={
            onJoin
              ? (e) => {
                  e.preventDefault()
                  onJoin()
                }
              : undefined
          }
        >
          Join
        </Link>
      </Button>
    </VStack>
  )
}
