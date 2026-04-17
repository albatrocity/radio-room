import type { AppContext } from "@repo/types"
import type { User } from "@repo/types/User"
import { getUser } from "../data"

/**
 * Prefer current Redis user display name when still present; otherwise keep queue snapshot.
 * Ensures a non-empty username string for persisted meta/playlist when userId is known.
 */
export async function resolveAddedByForPlayback(
  context: AppContext,
  added: User | null | undefined,
): Promise<User | undefined> {
  if (!added?.userId) {
    return added ?? undefined
  }

  const live = await getUser({ context, userId: added.userId })
  const username = (live?.username ?? added.username)?.trim()
  if (username) {
    return { userId: added.userId, username }
  }

  return {
    userId: added.userId,
    username: `Guest (${added.userId.slice(0, 8)})`,
  }
}
