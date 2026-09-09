import { createItem } from "../shared/types"

/** Fully-qualified inventory definition id (client visual key — ADR 0136 / 0168). */
export const BEAT_DETECTOR_DEFINITION_ID = "item-shops:beat-detector" as const

export const beatDetector = createItem({
  shortId: "beat-detector",
  definition: {
    name: "Beat Detector",
    description:
      "A handheld listening device that detects song tempo. Hold it in inventory to read an approximate BPM.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 50,
    icon: "Radar",
    rarity: "rare",
  },
  availableInRoomTypes: ["radio"],
})
