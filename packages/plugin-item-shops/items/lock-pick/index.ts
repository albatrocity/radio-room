import { createItem } from "../shared/types"
import { useLockPickingItem } from "../shared/lockPicking"

export const lockPick = createItem({
  shortId: "lock-pick",
  definition: {
    name: "Lock Pick",
    description:
      "Break into an abandoned storage container and take what items you can find. 30% chance of success.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "storedArtifact",
    coinValue: 50,
    icon: "LockKeyholeOpen",
    rarity: "rare",
  },
  use: useLockPickingItem({ successChance: 0.3 }),
})
