import { createItem } from "../shared/types"

export function dustyRecordTransitionMessage(recordName: string): string {
  return `${recordName} got all dusty!`
}

export const dustyRecord = createItem({
  shortId: "dusty-record",
  definition: {
    name: "Dusty Record",
    description: "When was the last time this thing was cleaned? Unplayable.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 10,
    icon: "Disc3",
    rarity: "common",
  },
})
