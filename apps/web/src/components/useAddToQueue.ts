import { useMachine } from "@xstate/react"
import { queueMachine, QueueContext } from "../machines/queueMachine"
import { MetadataSourceTrack } from "@repo/types"

export default function useAddToQueue() {
  const [state, send] = useMachine(queueMachine)

  function addToQueue(track: MetadataSourceTrack) {
    send("SEND_TO_QUEUE", { track })
  }

  return { state, send, addToQueue }
}

