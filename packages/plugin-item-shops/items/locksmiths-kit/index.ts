import { createItem } from "../shared/types"
import { useLockPickingItem } from "../shared/lockPicking"

export const locksmithsKit = createItem({
  shortId: "locksmiths-kit",
  definition: {
    name: "Locksmith's Kit",
    description:
      "Break into an abandoned storage container and take what items you can find. 75% chance of success.",
    stackable: true,
    maxStack: 2,
    tradeable: true,
    consumable: true,
    requiresTarget: "storedArtifact",
    coinValue: 100,
    icon: "KeyRound",
    rarity: "legendary",
  },
  use: useLockPickingItem({ successChance: 0.75 }),
})
