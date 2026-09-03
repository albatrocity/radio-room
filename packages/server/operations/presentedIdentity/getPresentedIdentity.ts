import {
  isPresentedIdentityGrantActive,
  resolvePresentedIdentity,
} from "@repo/game-logic"
import type {
  AppContext,
  PresentedIdentityGrant,
  PresentedIdentityResolveResult,
} from "@repo/types"
import { getUser } from "../data/users"
import {
  deletePresentedIdentityKey,
  parsePresentedIdentityGrant,
  presentedIdentityKey,
} from "./keys"

export async function getPresentedIdentity(params: {
  context: AppContext
  roomId: string
  userId: string
  now?: number
}): Promise<PresentedIdentityGrant | null> {
  const { context, roomId, userId, now = Date.now() } = params
  const raw = await context.redis.pubClient.get(presentedIdentityKey(roomId, userId))
  const grant = parsePresentedIdentityGrant(raw)
  if (!grant) return null

  const session = await context.gameSessions?.getActiveSession(roomId)
  if (!session || session.id !== grant.sessionId || !isPresentedIdentityGrantActive(grant, now)) {
    await deletePresentedIdentityKey(context, roomId, userId)
    return null
  }
  return grant
}

export async function resolveActorPresentedIdentity(params: {
  context: AppContext
  roomId: string
  userId: string
  now?: number
  /**
   * The actor's true username, when the caller already read the user in the
   * same operation. Passing it skips a second `HGETALL user:{id}` on hot paths
   * (chat send). Callers that came up empty pass their own fallback (e.g.
   * `userId`); an empty/blank value falls back to reading the user here.
   */
  trueUsername?: string
}): Promise<PresentedIdentityResolveResult> {
  const { context, roomId, userId, now = Date.now() } = params
  const prefetchedUsername = params.trueUsername?.trim()
  const [user, grant] = await Promise.all([
    prefetchedUsername ? null : getUser({ context, userId }),
    getPresentedIdentity({ context, roomId, userId, now }),
  ])
  return resolvePresentedIdentity({
    userId,
    trueUsername: prefetchedUsername || user?.username?.trim() || userId,
    grant,
    now,
  })
}
