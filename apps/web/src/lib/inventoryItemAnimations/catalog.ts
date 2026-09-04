import { HEAD_SHAKE_DURATION_MS, playHeadShakeEffect } from "./effects/headShake"
import { RESTORE_SWELL_DURATION_MS, playRestoreSwellEffect } from "./effects/restoreSwell"

export type InventoryItemAnimationName = "headShake" | "restoreSwell"

export type InventoryItemAnimationEntry = {
  durationMs: number
  play: (element: HTMLElement) => Promise<void>
}

export const INVENTORY_ITEM_ANIMATIONS: Record<
  InventoryItemAnimationName,
  InventoryItemAnimationEntry
> = {
  headShake: {
    durationMs: HEAD_SHAKE_DURATION_MS,
    play: playHeadShakeEffect,
  },
  restoreSwell: {
    durationMs: RESTORE_SWELL_DURATION_MS,
    play: playRestoreSwellEffect,
  },
}
