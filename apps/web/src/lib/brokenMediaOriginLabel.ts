import {
  albumTitleFromItemName,
  brokenMediaOriginHint,
  inventoryItemDescription,
  isBrokenMediaShortId,
} from "@repo/game-logic"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import {
  PHYSICAL_MEDIA_ORIGIN_KEY,
  PHYSICAL_MEDIA_ORIGIN_TITLE_KEY,
} from "@repo/types"

/**
 * In-character hint for a converted broken-media stack.
 * Prefers denormalized `mediaOriginTitle`; falls back to resolving `mediaOrigin`
 * via definitionMap for legacy stacks. Shop-bought broken SKUs return undefined.
 */
export function brokenMediaOriginLabel(
  item: InventoryItem,
  definition: ItemDefinition | undefined,
  definitionMap?: Map<string, ItemDefinition>,
): string | undefined {
  if (!isBrokenMediaShortId(definition?.shortId)) return undefined

  const titleRaw = item.metadata?.[PHYSICAL_MEDIA_ORIGIN_TITLE_KEY]
  if (typeof titleRaw === "string") {
    const title = titleRaw.trim()
    if (title) return brokenMediaOriginHint(title)
  }

  const raw = item.metadata?.[PHYSICAL_MEDIA_ORIGIN_KEY]
  if (typeof raw !== "string" || !definitionMap) return undefined
  const originId = raw.trim()
  if (!originId) return undefined
  const originDef = definitionMap.get(originId)
  const name = originDef?.name?.trim()
  if (!name) return undefined
  return brokenMediaOriginHint(albumTitleFromItemName(name))
}

/** Catalog description plus optional broken-media origin hint for inventory UI. */
export function inventoryDisplayDescription(
  definition: ItemDefinition | undefined,
  originHint: string | undefined,
): string | undefined {
  return inventoryItemDescription(definition?.description, originHint)
}
