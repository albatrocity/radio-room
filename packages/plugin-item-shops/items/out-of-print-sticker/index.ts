import type { ItemUseResult } from "@repo/types"
import { createItem } from "../shared/types"

export const OUT_OF_PRINT_STICKER_SHORT_ID = "out-of-print-sticker"

export const outOfPrintSticker = createItem({
  shortId: OUT_OF_PRINT_STICKER_SHORT_ID,
  localLibraryGrant: { scope: "playlist", playlistKey: "out-of-print" },
  definition: {
    name: "Out Of Print Sticker",
    description:
      "Shelf access to Out Of Print finds. Open Add to Queue — spent when you add a matching Library track.",
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
      "Keep this sticker in your inventory. Open Add to Queue and browse the Out Of Print shelf — it's spent when the song is added.",
  }),
})
