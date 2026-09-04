import { createItem } from "../shared/types"
import { playbackDeviceSellbackValue, usePlaybackDevice } from "../shared/playbackDevice"

export const cdPlayer = createItem({
  shortId: "cd-player",
  definition: {
    name: "CD Player",
    description: "A tray, a laser, and a hopeful whir. Keep it to play compact discs.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    slotPool: "playback",
    playbackFormats: ["CD"],
    coinValue: 80,
    icon: "Disc2",
    rarity: "uncommon",
  },
  use: usePlaybackDevice,
  sellbackValue: playbackDeviceSellbackValue,
})
