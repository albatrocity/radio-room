import { createItem } from "../shared/types"
import { restoreMediaUse } from "../shared/restoreMedia"

export const pencil = createItem({
  shortId: "pencil",
  definition: {
    name: "Pencil",
    description: "A No. 2 pencil. The eraser's chewed, but the tip is sharp.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "mediaItem",
    coinValue: 25,
    icon: "Pencil",
    rarity: "uncommon",
  },
  use: restoreMediaUse({
    formats: ["TAPE"],
    itemLabel: "Pencil",
    successBody: (albumTitle) =>
      `You used the pencil to respool the tape and brought ${albumTitle} back to life.`,
  }),
})
