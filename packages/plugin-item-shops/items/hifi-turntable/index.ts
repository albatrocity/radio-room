import { createItem } from "../shared/types"
import { playbackDeviceSellbackValue, usePlaybackDevice } from "../shared/playbackDevice"

export const hifiTurntable = createItem({
  shortId: "hifi-turntable",
  definition: {
    name: "Hifi Turntable",
    description: "Legendary platter and tonearm. Plays LPs and 45s without damaging the vinyl.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    slotPool: "playback",
    playbackFormats: ["LP", "45"],
    gentlePlayback: true,
    coinValue: 300,
    icon: "Turntable",
    rarity: "legendary",
  },
  use: usePlaybackDevice,
  sellbackValue: playbackDeviceSellbackValue,
})
