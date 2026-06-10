import type { HandlerConnections } from "@repo/types"
import { createPollHandlers } from "./pollHandlersAdapter"

export async function createPoll(
  connections: HandlerConnections,
  data: {
    question: string
    options: { label: string }[]
    settings?: { hideRunningTotal?: boolean }
  },
) {
  const handlers = createPollHandlers(connections.socket.context)
  return handlers.createPoll(connections, data)
}

export async function castVote(
  connections: HandlerConnections,
  data: { pollId: string; optionId: string },
) {
  const handlers = createPollHandlers(connections.socket.context)
  return handlers.castVote(connections, data)
}

export async function closePoll(
  connections: HandlerConnections,
  data: { pollId: string },
) {
  const handlers = createPollHandlers(connections.socket.context)
  return handlers.closePoll(connections, data)
}

export async function deletePoll(
  connections: HandlerConnections,
  data: { pollId: string },
) {
  const handlers = createPollHandlers(connections.socket.context)
  return handlers.deletePoll(connections, data)
}
