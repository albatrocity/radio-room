import type { InventoryItem, ItemDefinition } from "@repo/types/Inventory"

/**
 * Used-gear rate for playback devices. Record Store listed buyback is 10% for
 * Physical Media; applying that to 80/150-coin durables would make swapping
 * under the 2-slot playback cap a near-full repurchase. 50% matches Sweetwater's
 * listed rate for bag durables.
 */
export const PLAYBACK_DEVICE_SELLBACK_RATE = 0.5

/** Per-stack sellback coins (ignores the current shop's buyback rate). */
export function playbackDeviceSellbackValue(
  _item: InventoryItem,
  definition: ItemDefinition,
): number {
  return Math.max(0, Math.floor((definition.coinValue ?? 0) * PLAYBACK_DEVICE_SELLBACK_RATE))
}
