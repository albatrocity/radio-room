import { createItem } from "../shared/types"
import { skipCurrentTrackUse } from "../shared/skipCurrentTrack"

export function tangledTapeTransitionMessage(recordName: string): string {
  return `${recordName} became all tangled up!`
}

export const tangledTape = createItem({
  shortId: "tangled-tape",
  definition: {
    name: "Tangled Tape",
    description: "This thing is a real mess. Skips the currently playing song",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    coinValue: 75,
    icon: "CassetteTape",
    rarity: "rare",
  },
  use: skipCurrentTrackUse({
    usedMessage: "Used Tangled Tape. It was lost with use.",
  }),
})
