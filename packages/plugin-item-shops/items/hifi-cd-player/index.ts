import { createItem } from "../shared/types"
import { playbackDeviceSellbackValue, usePlaybackDevice } from "../shared/playbackDevice"

export const hifiCdPlayer = createItem({
  shortId: "hifi-cd-player",
  definition: {
    name: "Hifi CD Player",
    description: "Reference laser and DAC. Plays compact discs without damaging them.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    slotPool: "playback",
    playbackFormats: ["CD"],
    gentlePlayback: true,
    coinValue: 300,
    icon: "Disc2",
    rarity: "legendary",
  },
  use: usePlaybackDevice,
  sellbackValue: playbackDeviceSellbackValue,
})
