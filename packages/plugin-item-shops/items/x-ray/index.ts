import { INVENTORY_PEEK_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

const FIVE_MIN_MS = 5 * 60 * 1000

export const xRay = createItem({
  shortId: "x-ray",
  definition: {
    name: "X-Ray",
    description: "For 5 minutes, peer into anybody's inventory — and see through disguises.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 50,
    icon: "ScanSearch",
    rarity: "rare",
  },
  use: timedModifierEffect({
    modifierName: "x-ray",
    effects: [
      {
        type: "flag",
        name: INVENTORY_PEEK_FLAG,
        value: true,
        intent: "neutral",
        durationMs: FIVE_MIN_MS,
      },
    ],
    successMessage: "X-Ray active. You can see other listeners' inventories for 5 minutes.",
    visibility: "self",
    announce: false,
  }),
})
