import type { UserInventory } from "@repo/types"

/** Fully-qualified Item Shops oscilloscope definition id (ADR 0136). */
export const OSCILLOSCOPE_DEFINITION_ID = "item-shops:oscilloscope" as const

export const PRIMARY_SOLID_CSS_VAR = "--chakra-colors-primary-solid"
export const PRIMARY_CONTRAST_CSS_VAR = "--chakra-colors-primary-contrast"

/** True when inventory holds at least one oscilloscope stack. */
export function inventoryOwnsOscilloscope(inventory: UserInventory | null | undefined): boolean {
  if (!inventory?.items?.length) return false
  return inventory.items.some(
    (item) => item.definitionId === OSCILLOSCOPE_DEFINITION_ID && item.quantity > 0,
  )
}
