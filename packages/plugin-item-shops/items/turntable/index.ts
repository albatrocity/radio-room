import { createItem } from "../shared/types"
import { playbackDeviceSellbackValue, usePlaybackDevice } from "../shared/playbackDevice"

export const turntable = createItem({
  shortId: "turntable",
  definition: {
    name: "Turntable",
    description: "Platter, tonearm, needle. Keep it to play LPs and 45s.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    slotPool: "playback",
    playbackFormats: ["LP", "45"],
    coinValue: 80,
    icon: "Turntable",
    rarity: "uncommon",
  },
  use: usePlaybackDevice,
  sellbackValue: playbackDeviceSellbackValue,
})
