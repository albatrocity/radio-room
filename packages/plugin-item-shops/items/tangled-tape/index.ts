import { createItem } from "../shared/types"

export function tangledTapeTransitionMessage(recordName: string): string {
  return `${recordName} became all tangled up!`
}

export const tangledTape = createItem({
  shortId: "tangled-tape",
  definition: {
    name: "Tangled Tape",
    description: "This thing is a real mess.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 10,
    icon: "CassetteTape",
    rarity: "common",
  },
})
