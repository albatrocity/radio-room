import type { AppContext } from "@repo/types"
import { claimDueModifierExpiries } from "../data/gameModifiers"

/**
 * Claim and remove modifiers whose `endAt` has elapsed (ADR 0191).
 * Safe across dynos: ZREM claim ensures only one worker emits each expiry.
 */
export async function sweepExpiredModifiers({
  context,
  now = Date.now(),
}: {
  context: AppContext
  now?: number
}): Promise<{ expired: number; skipped: number }> {
  const due = await claimDueModifierExpiries({ context, now })
  if (due.length === 0) return { expired: 0, skipped: 0 }

  const gameSessions = context.gameSessions as
    | {
        expireClaimedModifier?: (
          roomId: string,
          sessionId: string,
          userId: string,
          modifierId: string,
        ) => Promise<boolean>
      }
    | undefined

  if (!gameSessions?.expireClaimedModifier) {
    console.error("[Modifier Expiry Sweep] gameSessions.expireClaimedModifier unavailable")
    return { expired: 0, skipped: due.length }
  }

  let expired = 0
  let skipped = 0

  for (const item of due) {
    try {
      const ok = await gameSessions.expireClaimedModifier(
        item.roomId,
        item.sessionId,
        item.userId,
        item.modifierId,
      )
      if (ok) {
        expired += 1
      } else {
        skipped += 1
      }
    } catch (error) {
      skipped += 1
      console.error(
        `[Modifier Expiry Sweep] Failed ${item.roomId}:${item.sessionId}:${item.userId}:${item.modifierId}:`,
        error,
      )
    }
  }

  return { expired, skipped }
}
