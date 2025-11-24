import { Factory } from "fishery"
import { QueueItem } from "@repo/types"

import { metadataSourceTrackFactory } from "./metadataSourceTrack"
import { userFactory } from "./user"

export const queueItemFactory = Factory.define<QueueItem>(({ sequence }) => {
  const track = metadataSourceTrackFactory.params({ title: `Track ${sequence}` }).build()

  return {
    title: track.title,
    track,
    mediaSource: {
      type: "spotify",
      trackId: track.id,
    },
    metadataSource: {
      type: "spotify",
      trackId: track.id,
    },
    addedAt: 0,
    addedBy: userFactory.build(),
    addedDuring: undefined,
    playedAt: Date.now(),
  }
})
