import { refreshServiceTokens } from "./refreshServiceTokens"
import { cleanupRoom } from "./cleanupRooms"
import { AppContext } from "@repo/types"

export default async function ({ context }: { context: AppContext; cache: any }) {
  try {
    const roomIds = await context.redis.pubClient.sMembers("rooms")
    await Promise.all(
      roomIds.map(async (id) => {
        await refreshServiceTokens(context, id)
        return cleanupRoom(context, id)
      }),
    )
  } catch (e) {
    console.error(e)
  }
}
