import { useSocketMachine } from "../hooks/useSocketMachine"
import { queueMachine } from "../machines/queueMachine"
import { MetadataSourceTrack } from "@repo/types"

export default function useAddToQueue() {
  const [state, send] = useSocketMachine(queueMachine)

  function addToQueue(track: MetadataSourceTrack) {
    send({ type: "SEND_TO_QUEUE", track })
  }

  return { state, send, addToQueue }
}
