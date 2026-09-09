import type { UserInventory } from "@repo/types"

/** Fully-qualified Item Shops oscilloscope definition id (ADR 0136). */
export const OSCILLOSCOPE_DEFINITION_ID = "item-shops:oscilloscope" as const

/** Fully-qualified Item Shops beat-detector definition id (ADR 0168). */
export const BEAT_DETECTOR_DEFINITION_ID = "item-shops:beat-detector" as const

export const PRIMARY_SOLID_CSS_VAR = "--chakra-colors-primary-solid"
export const PRIMARY_CONTRAST_CSS_VAR = "--chakra-colors-primary-contrast"

function inventoryOwnsDefinition(
  inventory: UserInventory | null | undefined,
  definitionId: string,
): boolean {
  if (!inventory?.items?.length) return false
  return inventory.items.some(
    (item) => item.definitionId === definitionId && item.quantity > 0,
  )
}

/** True when inventory holds at least one oscilloscope stack. */
export function inventoryOwnsOscilloscope(inventory: UserInventory | null | undefined): boolean {
  return inventoryOwnsDefinition(inventory, OSCILLOSCOPE_DEFINITION_ID)
}

/** True when inventory holds at least one beat-detector stack. */
export function inventoryOwnsBeatDetector(inventory: UserInventory | null | undefined): boolean {
  return inventoryOwnsDefinition(inventory, BEAT_DETECTOR_DEFINITION_ID)
}

/** True when either radio visual needs the shared MSE analysis tap. */
export function inventoryNeedsAnalysisTap(inventory: UserInventory | null | undefined): boolean {
  return inventoryOwnsOscilloscope(inventory) || inventoryOwnsBeatDetector(inventory)
}
