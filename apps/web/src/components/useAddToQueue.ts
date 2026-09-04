import { useSelector } from "@xstate/react"
import { queueActor } from "../actors/queueActor"
import { MetadataSourceTrack } from "@repo/types"

export default function useAddToQueue() {
  const isLoading = useSelector(queueActor, (snapshot) => snapshot.matches("loading"))
  const queuedTrack = useSelector(queueActor, (snapshot) => snapshot.context.queuedTrack)

  function addToQueue(track: MetadataSourceTrack) {
    queueActor.send({ type: "SEND_TO_QUEUE", track })
  }

  return { isLoading, queuedTrack, addToQueue }
}
