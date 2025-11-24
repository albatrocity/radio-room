import { Factory } from "fishery"
import { ChatMessage } from "@repo/types"
import { userFactory } from "./user"

export const chatMessageFactory = Factory.define<ChatMessage>(({ sequence }) => {
  const user = userFactory.build()
  return {
    content: "Hello, world!",
    timestamp: new Date().toISOString(),
    user: user,
    mentions: [],
    meta: {},
    reactions: [],
  }
})
