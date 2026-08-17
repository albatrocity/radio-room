import type { ItemUseResult } from "@repo/types"
import { createItem } from "../shared/types"

export const BARGAIN_BIN_STICKER_SHORT_ID = "bargain-bin-sticker"

export const bargainBinSticker = createItem({
  shortId: BARGAIN_BIN_STICKER_SHORT_ID,
  localLibraryGrant: { scope: "playlist", playlistKey: "bargain-bin" },
  definition: {
    name: "Bargain Bin Sticker",
    description:
      "Peel-and-stick shelf access to the Bargain Bin. Open Add to Queue — spent when you add a matching Library track.",
    stackable: true,
    maxStack: 5,
    tradeable: true,
    consumable: false,
    coinValue: 15,
    icon: "Sticker",
    rarity: "common",
  },
  use: async (): Promise<ItemUseResult> => ({
    success: false,
    consumed: false,
    message:
      "Keep this sticker in your inventory. Open Add to Queue and browse the Bargain Bin shelf — it's spent when the song is added.",
  }),
})
