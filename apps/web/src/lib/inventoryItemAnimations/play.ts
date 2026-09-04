import { INVENTORY_ITEM_ANIMATIONS, type InventoryItemAnimationName } from "./catalog"
import { queryInventoryItemElements, waitForInventoryItemElements } from "./targets"

export type PlayInventoryItemAnimationOptions = {
  /**
   * When the target row may not be mounted yet (e.g. conversion restore grants
   * a new itemId), poll until nodes appear or this budget elapses.
   */
  waitForDomMs?: number
}

/**
 * Play a named catalog animation on an arbitrary element (e.g. queue Add button).
 * No-ops when the user prefers reduced motion.
 */
export async function playNamedAnimation(
  element: HTMLElement,
  name: InventoryItemAnimationName,
): Promise<void> {
  const { areAnimationsEnabled } = await import("../../actors/reducedMotionActor")
  if (!areAnimationsEnabled()) return
  const entry = INVENTORY_ITEM_ANIMATIONS[name]
  await entry.play(element)
}

/**
 * Play a named catalog animation on every DOM node marked with the given
 * inventory item id. No-ops when reduced motion is on or no nodes exist.
 */
export async function playInventoryItemAnimation(
  itemId: string,
  name: InventoryItemAnimationName,
  options?: PlayInventoryItemAnimationOptions,
): Promise<void> {
  const { areAnimationsEnabled } = await import("../../actors/reducedMotionActor")
  if (!areAnimationsEnabled()) return

  const waitMs = options?.waitForDomMs ?? 0
  const elements =
    waitMs > 0
      ? await waitForInventoryItemElements(itemId, waitMs)
      : queryInventoryItemElements(itemId)
  if (elements.length === 0) return

  const entry = INVENTORY_ITEM_ANIMATIONS[name]
  await Promise.all(elements.map((el) => entry.play(el)))
}
