import type { AppContext, PresentedIdentityGrant } from "@repo/types"
import { getPresentedIdentity } from "./getPresentedIdentity"
import { presentedIdentityKey } from "./keys"

export type SetPresentedIdentityEngagedResult =
  | { ok: true; grant: PresentedIdentityGrant }
  | { ok: false; reason: "no_grant" | "not_toggleable" | "expired" }

export async function setPresentedIdentityEngaged(params: {
  context: AppContext
  roomId: string
  userId: string
  engaged: boolean
  now?: number
}): Promise<SetPresentedIdentityEngagedResult> {
  const { context, roomId, userId, engaged, now = Date.now() } = params
  const grant = await getPresentedIdentity({ context, roomId, userId, now })
  if (!grant) return { ok: false, reason: "no_grant" }
  if (!grant.toggleable) return { ok: false, reason: "not_toggleable" }

  const next: PresentedIdentityGrant = { ...grant, engaged: Boolean(engaged) }
  const remainingMs = grant.expiresAt - now
  if (remainingMs <= 0) return { ok: false, reason: "expired" }

  const ttlSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
  await context.redis.pubClient.set(presentedIdentityKey(roomId, userId), JSON.stringify(next), {
    EX: ttlSeconds,
  })

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "PRESENTED_IDENTITY_CHANGED", {
      roomId,
      userId,
      grant: next,
    })
  }

  return { ok: true, grant: next }
}
