import { Reaction, ReactionPayload, ReactionStore } from "@repo/types"
import { Emoji } from "@repo/types/Emoji"

import { Factory } from "fishery"

export const reactionFactory = Factory.define<Reaction>(({ sequence }) => ({
  emoji: `emoji-${sequence}`,
  user: `user-${sequence}`,
}))

export const reactionPayloadFactory = Factory.define<ReactionPayload>(({ sequence }) => ({
  emoji: `emoji-${sequence}` as unknown as Emoji,
  reactTo: {
    type: "message",
    id: `message-${sequence}`,
  },
  user: {
    userId: `user-${sequence}`,
    username: `user-${sequence}`,
    displayName: `User ${sequence}`,
  },
}))

export const reactionStoreFactory = Factory.define<ReactionStore>(() => ({
  message: {},
  track: {},
}))
