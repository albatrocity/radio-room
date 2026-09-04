import { useSelector } from "@xstate/react"
import { queueActor } from "../actors/queueActor"
import { MetadataSourceTrack } from "@repo/types"

export default function useAddToQueue() {
  const state = useSelector(queueActor, (snapshot) => snapshot)

  function addToQueue(track: MetadataSourceTrack) {
    queueActor.send({ type: "SEND_TO_QUEUE", track })
  }

  return { state, send: queueActor.send, addToQueue }
}
