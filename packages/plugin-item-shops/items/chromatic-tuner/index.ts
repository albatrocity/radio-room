import { createItem } from "../shared/types"

/** Fully-qualified inventory definition id (client visual key — ADR 0136 / 0171). */
export const CHROMATIC_TUNER_DEFINITION_ID = "item-shops:chromatic-tuner" as const

export const chromaticTuner = createItem({
  shortId: "chromatic-tuner",
  definition: {
    name: "Chromatic Tuner",
    description:
      "It's a TU-2 knockoff, and it's not very accurate. Keep in inventory to detect what key the currently playing song is in.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 50,
    icon: "Music2",
    rarity: "rare",
  },
  availableInRoomTypes: ["radio"],
})
