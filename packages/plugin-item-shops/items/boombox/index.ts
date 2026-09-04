import { createItem } from "../shared/types"
import { playbackDeviceSellbackValue, usePlaybackDevice } from "../shared/playbackDevice"

export const boombox = createItem({
  shortId: "boombox",
  definition: {
    name: "Boombox",
    description: "Shoulder-mounted dual-format. Keep it to play CDs and cassettes.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    slotPool: "playback",
    playbackFormats: ["CD", "TAPE"],
    coinValue: 150,
    icon: "RadioReceiver",
    rarity: "rare",
  },
  use: usePlaybackDevice,
  sellbackValue: playbackDeviceSellbackValue,
})
