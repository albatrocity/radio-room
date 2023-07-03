import { useMachine } from "@xstate/react"
import { spotifyQueueMachine } from "../machines/spotifyQueueMachine"
import { SpotifyTrack } from "../types/SpotifyTrack"

export default function useAddToSpotifyQueue() {
  const [state, send] = useMachine(spotifyQueueMachine)

  function addToQueue(track: SpotifyTrack) {
    send("SEND_TO_QUEUE", { track })
  }

  return { state, send, addToQueue }
}
