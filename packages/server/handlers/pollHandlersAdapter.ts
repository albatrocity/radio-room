import type { AppContext, HandlerConnections } from "@repo/types"
import { castVote, closePoll, createPoll, deletePoll } from "../operations/polls"

export class PollHandlers {
  constructor(private readonly context: AppContext) {}

  createPoll = async (
    { socket }: HandlerConnections,
    data: {
      question: string
      options: { label: string }[]
      settings?: { hideRunningTotal?: boolean }
    },
  ) => {
    const { roomId, userId } = socket.data
    if (!roomId || !userId) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 401,
          error: "Unauthorized",
          message: "You must be logged in to a room to create a poll.",
        },
      })
      return
    }

    const result = await createPoll({
      context: this.context,
      roomId,
      userId,
      question: data.question,
      options: data.options,
      settings: data.settings,
    })

    if (!result.ok) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
    }
  }

  castVote = async (
    { socket, io }: HandlerConnections,
    data: { pollId: string; optionId: string },
  ) => {
    const { roomId, userId } = socket.data
    if (!roomId || !userId) {
      io.to(socket.id).emit("event", {
        type: "POLL_VOTE_FAILED",
        data: { pollId: data.pollId, reason: "UNAUTHORIZED" },
      })
      return
    }

    const result = await castVote({
      context: this.context,
      roomId,
      pollId: data.pollId,
      userId,
      optionId: data.optionId,
    })

    if (!result.ok) {
      io.to(socket.id).emit("event", {
        type: "POLL_VOTE_FAILED",
        data: { pollId: data.pollId, reason: result.reason },
      })
      return
    }

    io.to(socket.id).emit("event", {
      type: "POLL_VOTE_CONFIRMED",
      data: {
        pollId: result.pollId,
        optionId: result.optionId,
        isSwap: !result.isFirstVote,
      },
    })
  }

  closePoll = async ({ socket }: HandlerConnections, data: { pollId: string }) => {
    const { roomId, userId } = socket.data
    if (!roomId || !userId) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 401,
          error: "Unauthorized",
          message: "You must be logged in to a room to close a poll.",
        },
      })
      return
    }

    const result = await closePoll({
      context: this.context,
      roomId,
      userId,
      pollId: data.pollId,
    })

    if (!result.ok) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
    }
  }

  deletePoll = async ({ socket }: HandlerConnections, data: { pollId: string }) => {
    const { roomId, userId } = socket.data
    if (!roomId || !userId) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 401,
          error: "Unauthorized",
          message: "You must be logged in to a room to delete a poll.",
        },
      })
      return
    }

    const result = await deletePoll({
      context: this.context,
      roomId,
      userId,
      pollId: data.pollId,
    })

    if (!result.ok) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
    }
  }
}

export function createPollHandlers(context: AppContext) {
  return new PollHandlers(context)
}
