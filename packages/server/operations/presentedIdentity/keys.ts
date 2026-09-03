import type { AppContext, PresentedIdentityGrant } from "@repo/types"

export function presentedIdentityKey(roomId: string, userId: string): string {
  return `room:${roomId}:presentedIdentity:${userId}`
}

export function presentedIdentityIndexKey(roomId: string): string {
  return `room:${roomId}:presentedIdentityUsers`
}

export function parsePresentedIdentityGrant(raw: string | null): PresentedIdentityGrant | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PresentedIdentityGrant
    if (
      !parsed ||
      typeof parsed.userId !== "string" ||
      typeof parsed.label !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.sessionId !== "string"
    ) {
      return null
    }
    return {
      userId: parsed.userId,
      label: parsed.label,
      ...(typeof parsed.chromeLabel === "string" && parsed.chromeLabel.trim()
        ? { chromeLabel: parsed.chromeLabel.trim() }
        : {}),
      ...(typeof parsed.icon === "string" && parsed.icon ? { icon: parsed.icon } : {}),
      engaged: Boolean(parsed.engaged),
      toggleable: Boolean(parsed.toggleable),
      expiresAt: parsed.expiresAt,
      source: typeof parsed.source === "string" ? parsed.source : "unknown",
      ...(typeof parsed.modifierId === "string" && parsed.modifierId
        ? { modifierId: parsed.modifierId }
        : {}),
      sessionId: parsed.sessionId,
    }
  } catch {
    return null
  }
}

export async function deletePresentedIdentityKey(
  context: AppContext,
  roomId: string,
  userId: string,
): Promise<void> {
  const tx = context.redis.pubClient.multi()
  tx.del(presentedIdentityKey(roomId, userId))
  tx.sRem(presentedIdentityIndexKey(roomId), userId)
  await tx.exec()
}

export async function clearAllPresentedIdentitiesForRoom(
  context: AppContext,
  roomId: string,
): Promise<void> {
  const indexKey = presentedIdentityIndexKey(roomId)
  const userIds = await context.redis.pubClient.sMembers(indexKey)
  if (userIds.length === 0) {
    await context.redis.pubClient.del(indexKey)
    return
  }
  const tx = context.redis.pubClient.multi()
  for (const userId of userIds) {
    tx.del(presentedIdentityKey(roomId, userId))
  }
  tx.del(indexKey)
  await tx.exec()
}
