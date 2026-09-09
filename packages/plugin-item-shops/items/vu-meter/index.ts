import { createItem } from "../shared/types"

/** Fully-qualified inventory definition id (client visual key — ADR 0136 / 0169). */
export const VU_METER_DEFINITION_ID = "item-shops:vu-meter" as const

export const vuMeter = createItem({
  shortId: "vu-meter",
  definition: {
    name: "VU Meter",
    description:
      "A classic analog VU for your Now Playing panel. Hold it in inventory in a radio room to watch stream level on a glowing needle — it can sit alongside the Oscilloscope. Sell, gift, or trade it away and the meter goes dark.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 50,
    icon: "Gauge",
    rarity: "rare",
  },
  availableInRoomTypes: ["radio"],
})
