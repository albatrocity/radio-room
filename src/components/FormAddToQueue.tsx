import React from "react"
import { Box, Text, useToast } from "@chakra-ui/react"
import SpotifySearch from "./SpotifySearch"
import { SingleValue } from "chakra-react-select"
import { SpotifyTrack } from "../types/SpotifyTrack"
import { spotifyQueueMachine } from "../machines/spotifyQueueMachine"
import { useMachine } from "@xstate/react"

type Props = {}

const FormAddToQueue = ({}: Props) => {
  const toast = useToast()
  const [state, send] = useMachine(spotifyQueueMachine, {
    actions: {
      onQueued: () => {
        toast({
          title: `Added to Queue`,
          description: `${state.context.queuedTrack?.name} will play sometime soon`,
          status: "success",
          duration: 4000,
          isClosable: true,
          position: "top",
        })
      },
    },
  })
  const handleSelect = (track: SingleValue<SpotifyTrack>) => {
    send("SEND_TO_QUEUE", { track })
  }

  return (
    <Box textStyle="body">
      <Text as="p" fontSize="sm">
        Selecting a song will send it to the DJ's play queue, where they can
        choose to leave it in, reorder it, or remove it completely.
      </Text>
      <SpotifySearch
        onChoose={handleSelect}
        placeholder="Search for a track on Spotify"
        autoFocus
      />
    </Box>
  )
}

export default FormAddToQueue
