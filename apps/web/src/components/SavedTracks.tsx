import React from "react"
import { Box, Center, Spinner, VStack } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"

import { savedTracksMachine, SavedTracksContext } from "../machines/savedTracksMachine"
import TrackItem from "./TrackItem"

interface Props {
  readonly onClick?: (track: SavedTracksContext["savedTracks"][number]) => void
  readonly isDisabled?: boolean
  readonly loadingItem?: SavedTracksContext["savedTracks"][number] | null
}

export default function SavedTracks({ onClick, isDisabled, loadingItem }: Readonly<Props>) {
  const [state] = useMachine(savedTracksMachine)
  const isLoading = state.matches("loading")

  return (
    <VStack align="flex-start" gap={2} overflow="hidden" w="100%">
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
            <Box position="absolute" left={0} top={0} bg="whiteAlpha.700" w="100%" h="100%">
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
