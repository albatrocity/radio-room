import type { ItemUseResult } from "@repo/types"
import { createItem } from "../shared/types"

export const LOCAL_HEROES_STICKER_SHORT_ID = "local-heroes-sticker"

export const localHeroesSticker = createItem({
  shortId: LOCAL_HEROES_STICKER_SHORT_ID,
  localLibraryGrant: { scope: "playlist", playlistKey: "local-heroes" },
  definition: {
    name: "Local Heroes Sticker",
    description:
      "Shelf access to Local Heroes. Open Add to Queue — spent when you add a matching Library track.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 25,
    icon: "Sticker",
    rarity: "uncommon",
  },
  use: async (): Promise<ItemUseResult> => ({
    success: false,
    consumed: false,
    message:
      "Keep this sticker in your inventory. Open Add to Queue and browse the Local Heroes shelf — it's spent when the song is added.",
  }),
})
