import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

export const libraryCard = createItem({
  shortId: "library-card",
  definition: {
    name: "Library Card",
    description:
      "Somebody's old library card. Check out one track from the whole Library.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 100,
    icon: "IdCard",
    rarity: "legendary",
    slotPool: "inventory",
  },
  localLibraryGrant: { scope: "library", redemption: "perQueue" },
  use: async (
    _deps: ItemShopsBehaviorDeps,
    _userId: string,
    _definition: ItemDefinition,
  ): Promise<ItemUseResult> => {
    return {
      success: true,
      consumed: false,
      message:
        "Keep this in your inventory. Open Add to Queue and pick a Library track — it's spent when the song is added.",
    }
  },
})
