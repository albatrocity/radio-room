import type { ItemUseResult } from "@repo/types"

/** Defense-block fields shared by `ApplyModifierResult` / `MoveTrackResult` / check-defense. */
export type DefenseBlockedFields = {
  attackerMessage?: string
  blockingItemName: string
}

/**
 * Maps a defense-blocked apply/move/check result to a consuming item-use failure.
 */
export function toDefenseBlockedUseResult(result: DefenseBlockedFields): ItemUseResult {
  return {
    success: false,
    consumed: true,
    title: "Intercepted",
    message:
      result.attackerMessage ??
      `Blocked by ${result.blockingItemName}. Your item was lost with use.`,
  }
}
