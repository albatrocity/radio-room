import { refreshServiceTokens } from "./refreshServiceTokens"
import { cleanupRoom } from "./cleanupRooms"
import { AppContext, JobApi } from "@repo/types"

export default async function roomsJobHandler({ context }: { api: JobApi; context: AppContext }) {
  try {
    const roomIds = await context.redis.pubClient.sMembers("rooms")
    console.log(`[Rooms Job] Processing ${roomIds.length} rooms for cleanup/token refresh`)

    await Promise.all(
      roomIds.map(async (id) => {
        await refreshServiceTokens(context, id)
        return cleanupRoom(context, id)
      }),
    )
  } catch (e) {
    console.error("[Rooms Job] Error:", e)
  }
}
