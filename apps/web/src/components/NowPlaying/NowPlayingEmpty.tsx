import { Heading, Text, VStack } from "@chakra-ui/react"
import { hasListenableStream } from "../../lib/roomTypeHelpers"

interface NowPlayingEmptyProps {
  roomType: "radio" | "jukebox" | "live"
  isAdmin: boolean
}

export function NowPlayingEmpty({ roomType, isAdmin }: NowPlayingEmptyProps) {
  const isStream = hasListenableStream({ type: roomType })

  return (
    <VStack gap={2} px={4} alignContent="flex-start">
      <Heading w="100%" as="h2" size="lg" color="whiteAlpha.900" textAlign="left">
        Nothing is playing
      </Heading>
      <Text color="whiteAlpha.900">
        {isStream
          ? isAdmin
            ? roomType === "live"
              ? "The live stream appears to be offline. Check your RTMP ingest."
              : "The radio station appears to be offline. Check your station URL in settings."
            : roomType === "live"
            ? "The live stream appears to be offline."
            : "The radio station appears to be offline."
          : isAdmin
          ? "There's no active device playing Spotify. Play something on your Spotify app and check back here."
          : "The host isn't currently playing anything on their Spotify account."}
      </Text>
    </VStack>
  )
}
