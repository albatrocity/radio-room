import { Server } from "socket.io"
import { PUBSUB_SPOTIFY_AUTH_ERROR, PUBSUB_RADIO_ERROR } from "../../lib/constants"
import { AppContext } from "../../lib/context"
import { createOperations } from "../../operations"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import { MetadataSourceError } from "@repo/types/MetadataSource"
import getRoomPath from "../../lib/getRoomPath"
import { pubRoomSettingsUpdated } from "../../operations/room/handleRoomNowPlayingData"

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

export default async function bindHandlers(io: Server, context: AppContext) {
  context.redis.subClient.pSubscribe(PUBSUB_SPOTIFY_AUTH_ERROR, (message, channel) =>
    handleMetadataSourceError({ io, message, channel, context }),
  )
  context.redis.subClient.pSubscribe(PUBSUB_RADIO_ERROR, (message, channel) =>
    handleRadioError({ io, message, channel, context }),
  )
}

function getErrorMessage(status: number) {
  switch (status) {
    case 401:
      return "Your Spotify account has been disconnected. Please log back into Spotify."
    case 403:
      return "You are not authorized to perform this action."
    case 404:
      return "The requested resource could not be found."
    default:
      return "An error occurred with Spotify. Please try again later."
  }
}

async function handleMetadataSourceError({ io, message, context }: ContextPubSubHandlerArgs) {
  const { userId, roomId, error }: { userId: string; roomId?: string; error: MetadataSourceError } =
    JSON.parse(message)

  const operations = createOperations(context)
  const user = await operations.users.getUser({ userId, context })
  if (user?.id) {
    io.to(user.id).emit("event", {
      type: "ERROR",
      data: {
        status: error.status,
        message: getErrorMessage(error.status),
        error: error.reason,
        duration: null,
        id: "metadata-source-auth-401",
      },
    })
  }

  if (roomId) {
    await context.redis.pubClient.hSet(
      `room:${roomId}:details`,
      "spotifyError",
      JSON.stringify(error),
    )
  }
}

async function handleRadioError({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, error }: { userId: string; roomId?: string; error: Error } = JSON.parse(message)
  if (roomId) {
    io.to(getRoomPath(roomId)).emit("event", {
      type: "ERROR",
      data: {
        status: 500,
        message:
          "Fetching the radio station failed. Please check the radio station URL and protocol in the room settings.",
        duration: null,
        id: "radio-error",
      },
    })

    await context.redis.pubClient.hSet(
      `room:${roomId}:details`,
      "radioError",
      JSON.stringify({ message: String(error.message), status: 500 }),
    )

    await pubRoomSettingsUpdated({ context, roomId })
  }
}
