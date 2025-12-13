import { Button, Card, Heading, Text, VStack, HStack, Image, Box } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { LuUsers, LuMusic } from "react-icons/lu"
import { Room } from "../types/Room"
import ParsedEmojiMessage from "./ParsedEmojiMessage"

type NowPlayingInfo = {
  track?: string
  artist?: string
  album?: string
  artwork?: string
} | null

type Props = Omit<Room, "password"> & {
  userCount?: number
  nowPlaying?: NowPlayingInfo
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
          {nowPlaying?.track && (
            <HStack gap={2} p={2} bg="bg.subtle" borderRadius="md">
              {nowPlaying.artwork ? (
                <Image
                  src={nowPlaying.artwork}
                  alt={nowPlaying.album}
                  boxSize="40px"
                  borderRadius="sm"
                  objectFit="cover"
                />
              ) : (
                <Box p={2} bg="bg.muted" borderRadius="sm">
                  <LuMusic />
                </Box>
              )}
              <VStack align="start" gap={0} flex={1} minW={0}>
                <Text fontSize="sm" fontWeight="medium" truncate>
                  {nowPlaying.track}
                </Text>
                {nowPlaying.artist && (
                  <Text fontSize="xs" color="fg.muted" truncate>
                    {nowPlaying.artist}
                  </Text>
                )}
              </VStack>
            </HStack>
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
