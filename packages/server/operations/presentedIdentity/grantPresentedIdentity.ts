import type { AppContext, PresentedIdentityGrant, PresentedIdentityGrantInput } from "@repo/types"
import { presentedIdentityIndexKey, presentedIdentityKey } from "./keys"

/** Re-exported under the operation's historical name; shape lives in `@repo/types`. */
export type GrantPresentedIdentityInput = PresentedIdentityGrantInput

export async function grantPresentedIdentity(params: {
  context: AppContext
  roomId: string
  input: GrantPresentedIdentityInput
  now?: number
}): Promise<PresentedIdentityGrant | null> {
  const { context, roomId, input, now = Date.now() } = params
  const session = await context.gameSessions?.getActiveSession(roomId)
  if (!session) return null

  const durationMs = Math.max(0, Math.floor(input.durationMs))
  if (durationMs <= 0) return null

  const label = input.label.trim()
  if (!label) return null

  const toggleable = Boolean(input.toggleable)
  const engaged = toggleable ? (input.engaged ?? true) : true
  const expiresAt = now + durationMs

  const grant: PresentedIdentityGrant = {
    userId: input.userId,
    label,
    ...(input.chromeLabel?.trim() ? { chromeLabel: input.chromeLabel.trim() } : {}),
    ...(input.icon ? { icon: input.icon } : {}),
    engaged,
    toggleable,
    expiresAt,
    source: input.source,
    ...(input.modifierId ? { modifierId: input.modifierId } : {}),
    sessionId: session.id,
  }

  const ttlSeconds = Math.max(1, Math.ceil(durationMs / 1000))
  const tx = context.redis.pubClient.multi()
  tx.set(presentedIdentityKey(roomId, input.userId), JSON.stringify(grant), {
    EX: ttlSeconds,
  })
  tx.sAdd(presentedIdentityIndexKey(roomId), input.userId)
  await tx.exec()

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "PRESENTED_IDENTITY_CHANGED", {
      roomId,
      userId: input.userId,
      grant,
    })
  }

  return grant
}
