import { createItem } from "../shared/types"
import { skipCurrentTrackUse } from "../shared/skipCurrentTrack"

export function dustyRecordTransitionMessage(recordName: string): string {
  return `${recordName} got all dusty!`
}

export const dustyRecord = createItem({
  shortId: "dusty-record",
  definition: {
    name: "Dusty Record",
    description:
      "When was the last time this thing was cleaned? Unplayable. Skips whatever song is currently playing",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 75,
    icon: "Disc3",
    rarity: "rare",
  },
  use: skipCurrentTrackUse({
    usedMessage: "Used Dusty Record. It was lost with use.",
  }),
})
