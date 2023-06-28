import { useToast } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import { spotifyQueueMachine } from "../machines/spotifyQueueMachine"
import { SpotifyTrack } from "../types/SpotifyTrack"

export default function useAddToSpotifyQueue() {
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
      onQueueFailure: (_context, event) => {
        toast({
          title: `Track was not added`,
          description: event.data?.message || "Something went wrong",
          status: "error",
          duration: 4000,
          isClosable: true,
          position: "top",
        })
      },
    },
  })

  function addToQueue(track: SpotifyTrack) {
    send("SEND_TO_QUEUE", { track })
  }

  return { state, send, addToQueue }
}
