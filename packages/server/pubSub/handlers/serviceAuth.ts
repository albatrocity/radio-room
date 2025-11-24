import { Server } from "socket.io"

import {
  PUBSUB_USER_SERVICE_ACCESS_TOKEN_REFRESHED,
  PUBSUB_USER_SERVICE_AUTHENTICATION_STATUS,
} from "../../lib/constants"
import { getUser } from "../../operations/data"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import { AppContext } from "@repo/types"

/**
 * Bind service authentication PubSub handlers
 * Handles token refresh and authentication status for any music service
 */
export default async function bindHandlers(io: Server, context: AppContext) {
  context.redis.subClient.pSubscribe(
    PUBSUB_USER_SERVICE_ACCESS_TOKEN_REFRESHED,
    (message, channel) => handleUserServiceTokenRefreshed({ io, message, channel }, context),
  )
  context.redis.subClient.pSubscribe(
    PUBSUB_USER_SERVICE_AUTHENTICATION_STATUS,
    (message, channel) => handleServiceAuthenticationStatus({ io, message, channel }, context),
  )
}

/**
 * Handle user service access token refresh
 * Emits to the user's socket room with the new access token
 */
async function handleUserServiceTokenRefreshed(
  { io, message, channel }: PubSubHandlerArgs,
  context: AppContext,
) {
  const { 
    userId, 
    accessToken, 
    serviceName 
  }: { 
    userId: string
    accessToken: string
    serviceName: string 
  } = JSON.parse(message)

  const user = await getUser({ context, userId })
  if (!user?.id) {
    return
  }

  io.to(user.id).emit("event", {
    type: "SERVICE_ACCESS_TOKEN_REFRESHED",
    data: { accessToken, serviceName },
  })

  // Also emit legacy event for backward compatibility
  if (serviceName === "spotify") {
    io.to(user.id).emit("event", {
      type: "SPOTIFY_ACCESS_TOKEN_REFRESHED",
      data: { accessToken },
    })
  }
}

/**
 * Handle service authentication status change
 * Emits to the user's socket room with their authentication status
 */
async function handleServiceAuthenticationStatus(
  { io, message }: PubSubHandlerArgs,
  context: AppContext,
) {
  const { 
    userId, 
    isAuthenticated, 
    serviceName 
  }: { 
    userId: string
    isAuthenticated: boolean
    serviceName: string 
  } = JSON.parse(message)

  const user = await getUser({ context, userId })
  if (!user?.id) {
    return
  }

  io.to(user.id).emit("event", {
    type: "SERVICE_AUTHENTICATION_STATUS",
    data: { isAuthenticated, serviceName },
  })

  // Also emit legacy event for backward compatibility
  if (serviceName === "spotify") {
    io.to(user.id).emit("event", {
      type: "SPOTIFY_AUTHENTICATION_STATUS",
      data: { isAuthenticated },
    })
  }
}

