import { createItem } from "../shared/types"

export function scratchedCdTransitionMessage(recordName: string): string {
  return `${recordName} became scratched!`
}

export const scratchedCd = createItem({
  shortId: "scratched-cd",
  definition: {
    name: "Scratched CD",
    description: "It's in pretty bad shape.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 10,
    icon: "Disc2",
    rarity: "common",
  },
})
