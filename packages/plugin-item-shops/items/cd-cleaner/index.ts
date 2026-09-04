import { createItem } from "../shared/types"
import { restoreMediaUse } from "../shared/restoreMedia"

export const cdCleaner = createItem({
  shortId: "cd-cleaner",
  definition: {
    name: "CD Cleaner",
    description: "A little bottle of disc cleaning fluid. Spray, wipe, hope.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "mediaItem",
    coinValue: 40,
    icon: "SprayCan",
    rarity: "uncommon",
  },
  use: restoreMediaUse({ formats: ["CD"], itemLabel: "CD Cleaner" }),
})
