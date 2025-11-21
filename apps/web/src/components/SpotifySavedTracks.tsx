import React from "react"
import { Box, Center, Spinner, VStack } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"

import { savedTracksMachine } from "../machines/savedTracksMachine"
import TrackItem from "./TrackItem"
import { MetadataSourceTrack } from "@repo/types"
import { useSpotifyAccessToken } from "../state/spotifyAuthStore"

interface Props {
  onClick?: (track: MetadataSourceTrack) => void
  isDisabled?: boolean
  loadingItem?: MetadataSourceTrack | null
}

export default function SpotifySavedTracks({
  onClick,
  isDisabled,
  loadingItem,
}: Props) {
  const accessToken = useSpotifyAccessToken()
  const [state] = useMachine(savedTracksMachine, {
    context: {
      accessToken,
    },
  })
  const isLoading = state.matches("loading")
  return (
    <VStack align="flex-start" spacing={2} overflow="hidden" w="100%">
      {isLoading && <Spinner />}
      {state.context.savedTracks.map((track) => (
        <Box
          key={track.id}
          cursor={isDisabled ? "default" : "pointer"}
          onClick={() => (isDisabled ? null : onClick?.(track))}
          position="relative"
          w="100%"
        >
          <TrackItem {...track} />
          {loadingItem?.id === track.id && (
            <Box
              position="absolute"
              left={0}
              top={0}
              bg="whiteAlpha.700"
              w="100%"
              h="100%"
            >
              <Center w="100%" h="100%">
                <Spinner />
              </Center>
            </Box>
          )}
        </Box>
      ))}
    </VStack>
  )
}
