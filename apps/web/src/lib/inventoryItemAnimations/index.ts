export type { InventoryItemAnimationName } from "./catalog"
export { INVENTORY_ITEM_ANIMATIONS } from "./catalog"
export { playNamedAnimation, playInventoryItemAnimation } from "./play"
export type { PlayInventoryItemAnimationOptions } from "./play"
export { INVENTORY_ITEM_DOM_ATTR, queryInventoryItemElements } from "./targets"
export { HEAD_SHAKE_DURATION_MS } from "./effects/headShake"
export { RESTORE_SWELL_DURATION_MS } from "./effects/restoreSwell"

import { playInventoryItemAnimation, playNamedAnimation } from "./play"

/** @deprecated Prefer {@link playNamedAnimation}(el, "headShake"). */
export function playHeadShake(element: HTMLElement): Promise<void> {
  return playNamedAnimation(element, "headShake")
}

/** @deprecated Prefer {@link playInventoryItemAnimation}(id, "headShake"). */
export function shakeInventoryItemById(itemId: string): Promise<void> {
  return playInventoryItemAnimation(itemId, "headShake")
}
