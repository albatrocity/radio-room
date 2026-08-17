import type { ItemUseResult } from "@repo/types"
import { createItem } from "../shared/types"

export const UNRELEASED_STICKER_SHORT_ID = "unreleased-sticker"

export const unreleasedSticker = createItem({
  shortId: UNRELEASED_STICKER_SHORT_ID,
  localLibraryGrant: { scope: "playlist", playlistKey: "unreleased" },
  definition: {
    name: "Unreleased Sticker",
    description:
      "Shelf access to Unreleased cuts. Open Add to Queue — spent when you add a matching Library track.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 50,
    icon: "Sticker",
    rarity: "rare",
  },
  use: async (): Promise<ItemUseResult> => ({
    success: false,
    consumed: false,
    message:
      "Keep this sticker in your inventory. Open Add to Queue and browse the Unreleased shelf — it's spent when the song is added.",
  }),
})
