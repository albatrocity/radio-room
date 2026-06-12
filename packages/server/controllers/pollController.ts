import { Server } from "socket.io"
import { SocketWithContext } from "../lib/socketWithContext"
import { createPollHandlers } from "../handlers/pollHandlersAdapter"

/**
 * Poll Controller — registers poll-related socket events.
 */
export function createPollController(socket: SocketWithContext, io: Server): void {
  const handlers = createPollHandlers(socket.context)
  const connections = { socket, io }

  socket.on(
    "CREATE_POLL",
    async (data: {
      question: string
      options: { label: string }[]
      settings?: { hideRunningTotal?: boolean }
    }) => {
      await handlers.createPoll(connections, data)
    },
  )

  socket.on("CAST_POLL_VOTE", async (data: { pollId: string; optionId: string }) => {
    await handlers.castVote(connections, data)
  })

  socket.on("CLOSE_POLL", async (data: { pollId: string }) => {
    await handlers.closePoll(connections, data)
  })

  socket.on("DELETE_POLL", async (data: { pollId: string }) => {
    await handlers.deletePoll(connections, data)
  })
}

export default createPollController
