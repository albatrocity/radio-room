import type { PluginFieldMeta } from "@repo/types"
import {
  buildEffectiveItemCatalog,
  buildEffectiveShopCatalog,
} from "./localLibrary/catalog"
import { LOCAL_LIBRARY_GRANT_USE_MESSAGE } from "./localLibrary/grants"

/** Shared labels for object-array rows built from itemDefinitionAuthoringSchema keys. */
export function itemDefinitionAuthoringFieldMetas(options?: {
  showWhenEnabled?: boolean
}): { name: string; meta: PluginFieldMeta }[] {
  const showWhen = options?.showWhenEnabled
    ? { field: "enabled" as const, value: true }
    : undefined
  const base = (meta: PluginFieldMeta): PluginFieldMeta =>
    showWhen ? { ...meta, showWhen } : meta

  return [
    { name: "shortId", meta: base({ type: "string", label: "Item id (shortId)", description: "Stable id; changing it orphans existing inventory stacks." }) },
    { name: "name", meta: base({ type: "string", label: "Name" }) },
    { name: "description", meta: base({ type: "string", label: "Description" }) },
    { name: "icon", meta: base({ type: "string", label: "Icon (Lucide)", description: "e.g. Disc, IdCard" }) },
    {
      name: "rarity",
      meta: base({
        type: "enum",
        label: "Rarity",
        options: [
          { value: "common", label: "Common" },
          { value: "uncommon", label: "Uncommon" },
          { value: "rare", label: "Rare" },
          { value: "legendary", label: "Legendary" },
        ],
      }),
    },
    { name: "coinValue", meta: base({ type: "number", label: "Shop price (coins)" }) },
  ]
}

export { buildEffectiveItemCatalog, buildEffectiveShopCatalog, LOCAL_LIBRARY_GRANT_USE_MESSAGE }
