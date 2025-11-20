import { AppContext } from "@repo/types"
import { findRoom, updateRoom, delRoomKey } from "../../operations/data"
import { getUserServiceAuth } from "../../operations/data/serviceAuthentications"

/**
 * Refresh authentication tokens for a room's configured services
 * This is a generic job that works with any service adapter (Spotify, Tidal, etc.)
 */
export async function refreshServiceTokens(context: AppContext, roomId: string) {
  const room = await findRoom({ context, roomId })
  if (!room?.creator) {
    return
  }

  // Determine which services this room uses
  const servicesToRefresh: string[] = []
  
  if (room.playbackControllerId) {
    servicesToRefresh.push(room.playbackControllerId)
  }
  
  if (room.metadataSourceId && !servicesToRefresh.includes(room.metadataSourceId)) {
    servicesToRefresh.push(room.metadataSourceId)
  }

  // Refresh tokens for each service the room uses
  for (const serviceName of servicesToRefresh) {
    await refreshServiceTokensForUser(context, room.creator, serviceName, roomId)
  }

  // Update room refresh timestamp
  await updateRoom({ context, roomId, data: { lastRefreshedAt: Date.now().toString() } })
}

/**
 * Refresh tokens for a specific user and service
 */
async function refreshServiceTokensForUser(
  context: AppContext,
  userId: string,
  serviceName: string,
  roomId?: string,
) {
  try {
    // Get the service auth adapter
    const serviceAuthAdapter = context.adapters.serviceAuth.get(serviceName)
    
    if (!serviceAuthAdapter) {
      console.log(`No service auth adapter found for ${serviceName}`)
      return
    }

    // Check if user has auth for this service
    const auth = await getUserServiceAuth({
      context,
      userId,
      serviceName,
    })

    if (!auth || !auth.refreshToken) {
      console.log(`No refresh token available for user ${userId} on ${serviceName}`)
      return
    }

    // Check if token needs refresh (expires within 5 minutes)
    const now = Date.now()
    const expiresAt = auth.expiresAt || 0
    const shouldRefresh = expiresAt < now + 5 * 60 * 1000

    if (shouldRefresh) {
      console.log(`Refreshing ${serviceName} tokens for user ${userId}`)
      
      // Use the adapter's refresh method
      if (serviceAuthAdapter.refreshAuth) {
        await serviceAuthAdapter.refreshAuth(userId)
        
        // Clear any error flags if refresh was successful
        if (roomId) {
          await delRoomKey({
            context,
            roomId,
            key: "details",
            field: `${serviceName}Error`,
          })
        }
        
        console.log(`Successfully refreshed ${serviceName} tokens for user ${userId}`)
      }
    }
  } catch (error) {
    console.error(`Error refreshing ${serviceName} tokens for user ${userId}:`, error)
  }
}

