import type {
  AppContext,
  FeedbackTopicInput,
  FeedbackVote,
  HandlerConnections,
} from "@repo/types"
import { findRoom, getAdmins, isRoomAdmin } from "../operations/data"
import { emitToUserSocket } from "../lib/emitToUserSocket"
import {
  loadFeedbackInbox,
  saveFeedbackResponse,
  setFeedbackTopics,
  toFeedbackInboxEntry,
} from "../operations/feedback"

async function emitToRoomAdmins(params: {
  io: HandlerConnections["io"]
  context: AppContext
  roomId: string
  type: string
  data: unknown
}): Promise<void> {
  const room = await findRoom({ context: params.context, roomId: params.roomId })
  if (!room) return
  const adminIds = await getAdmins({ context: params.context, roomId: params.roomId })
  const targets = new Set<string>([...adminIds, room.creator].filter(Boolean))
  await Promise.all(
    [...targets].map((userId) =>
      emitToUserSocket({
        io: params.io,
        context: params.context,
        roomId: params.roomId,
        userId,
        type: params.type,
        data: params.data,
      }),
    ),
  )
}

export class FeedbackHandlers {
  constructor(private readonly context: AppContext) {}

  setTopics = async (
    { socket }: HandlerConnections,
    data: { topics: FeedbackTopicInput[] },
  ) => {
    const { roomId, userId } = socket.data
    if (!roomId || !userId) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 401,
          error: "Unauthorized",
          message: "You must be logged in to a room to edit feedback topics.",
        },
      })
      return
    }

    const result = await setFeedbackTopics({
      context: this.context,
      roomId,
      userId,
      topics: data.topics ?? [],
    })

    if (!result.ok) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
    }
  }

  saveResponse = async (
    { socket, io }: HandlerConnections,
    data: { topicId: string; vote?: FeedbackVote; comment?: string },
  ) => {
    const { roomId, userId } = socket.data
    if (!roomId || !userId) {
      io.to(socket.id).emit("event", {
        type: "FEEDBACK_RESPONSE_FAILED",
        data: { topicId: data.topicId, reason: "UNAUTHORIZED" },
      })
      return
    }

    const result = await saveFeedbackResponse({
      context: this.context,
      roomId,
      userId,
      topicId: data.topicId,
      vote: data.vote,
      comment: data.comment,
    })

    if (!result.ok) {
      io.to(socket.id).emit("event", {
        type: "FEEDBACK_RESPONSE_FAILED",
        data: { topicId: data.topicId, reason: result.reason },
      })
      return
    }

    io.to(socket.id).emit("event", {
      type: "FEEDBACK_RESPONSE_SAVED",
      data: { response: result.response },
    })

    const entry = await toFeedbackInboxEntry({
      context: this.context,
      response: result.response,
    })
    await emitToRoomAdmins({
      io,
      context: this.context,
      roomId,
      type: "FEEDBACK_INBOX_UPDATED",
      data: { entry },
    })
  }

  getInbox = async ({ socket }: HandlerConnections) => {
    const { roomId, userId } = socket.data
    if (!roomId || !userId) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 401,
          error: "Unauthorized",
          message: "You must be logged in to a room to view the feedback inbox.",
        },
      })
      return
    }

    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 404,
          error: "Not Found",
          message: "Room not found.",
        },
      })
      return
    }

    const isAdmin = await isRoomAdmin({
      context: this.context,
      roomId,
      userId,
      roomCreator: room.creator,
    })
    if (!isAdmin) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 403,
          error: "Forbidden",
          message: "You are not a room admin.",
        },
      })
      return
    }

    const inbox = await loadFeedbackInbox({ context: this.context, roomId })
    socket.emit("event", {
      type: "FEEDBACK_INBOX",
      data: inbox,
    })
  }
}

export function createFeedbackHandlers(context: AppContext) {
  return new FeedbackHandlers(context)
}
