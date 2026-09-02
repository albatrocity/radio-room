import type { ItemDefinition } from "@repo/types"

export function itemDefinitionMap(
  definitions: readonly ItemDefinition[] | null | undefined,
): Map<string, ItemDefinition> {
  const map = new Map<string, ItemDefinition>()
  for (const def of definitions ?? []) {
    map.set(def.id, def)
  }
  return map
}
