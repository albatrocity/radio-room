import { SNOOZE_FLAG } from "@repo/plugin-base"
import { timedModifierEffect } from "../shared/behaviorHelpers"
import { createItem } from "../shared/types"

export const snoozePedal = createItem({
  shortId: "snooze-pedal",
  definition: {
    name: "Snooze Pedal",
    description: "You are gettzng vzry slzzpy... Use on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 45,
    icon: "Moon",
    rarity: "rare",
  },
  use: timedModifierEffect({
    modifierName: "snooze-pedal",
    effects: [
      { type: "flag", name: SNOOZE_FLAG, value: true, intent: "negative", durationMs: 300000 },
    ],
    successMessage: "Snooze Pedal activated. It was lost with use.",
    describe: ({ isSelf, actor, target }) =>
      isSelf ? `${actor} yawned and stzrtzd to snooze...` : `${actor} used Snooze Pedal and ${target} got very slzzpy... `,
  }),
})
