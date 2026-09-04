import { createItem } from "../shared/types"
import { restoreMediaUse } from "../shared/restoreMedia"

export const dustCloth = createItem({
  shortId: "dust-cloth",
  definition: {
    name: "Dust Cloth",
    description: "A well-loved microfiber cloth. Soft enough for the grooves.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "mediaItem",
    coinValue: 40,
    icon: "Wind",
    rarity: "uncommon",
  },
  use: restoreMediaUse({
    formats: ["LP", "45"],
    itemLabel: "Dust Cloth",
    successBody: (albumTitle) =>
      `You cleaned off ${albumTitle} with the Dust Cloth and got some more life out of it.`,
  }),
})
