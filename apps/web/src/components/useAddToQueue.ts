import { useSocketMachine } from "../hooks/useSocketMachine"
import { QUEUE_EVENT_TYPES, queueMachine } from "../machines/queueMachine"
import { MetadataSourceTrack } from "@repo/types"

export default function useAddToQueue() {
  const [state, send] = useSocketMachine(queueMachine, undefined, QUEUE_EVENT_TYPES)

  function addToQueue(track: MetadataSourceTrack) {
    send({ type: "SEND_TO_QUEUE", track })
  }

  return { state, send, addToQueue }
}
