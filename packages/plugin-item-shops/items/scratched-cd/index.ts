import { createItem } from "../shared/types"
import { skipCurrentTrackUse } from "../shared/skipCurrentTrack"

export function scratchedCdTransitionMessage(recordName: string): string {
  return `${recordName} became scratched!`
}

export const scratchedCd = createItem({
  shortId: "scratched-cd",
  definition: {
    name: "Scratched CD",
    description: "It's in pretty bad shape. Skips whatever song is currently playing.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    coinValue: 50,
    icon: "Disc2",
    rarity: "rare",
  },
  use: skipCurrentTrackUse({
    usedMessage: "Used Scratched CD. It was lost with use.",
  }),
})
