import { ChatMessage } from "@repo/types"

const systemMessage = (content: string, meta?: {}, mentions?: ChatMessage["mentions"]) => {
  const newMessage = {
    user: {
      username: "system",
      id: "system",
      userId: "system",
    },
    content,
    meta,
    timestamp: new Date().toISOString(),
    mentions,
  }
  return newMessage
}

export default systemMessage
