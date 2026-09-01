import { createItem } from "../shared/types"

/** Fully-qualified inventory definition id (client visual key — ADR 0136). */
export const OSCILLOSCOPE_DEFINITION_ID = "item-shops:oscilloscope" as const

export const oscilloscope = createItem({
  shortId: "oscilloscope",
  definition: {
    name: "Oscilloscope",
    description:
      "A classic CRT scope for your Now Playing panel. Hold it in inventory in a radio room to see the stream as a glowing waveform. Sell, gift, or trade it away and the scope goes dark.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 35,
    icon: "AudioLines",
    rarity: "rare",
  },
  availableInRoomTypes: ["radio"],
})
