import { createItem } from "../shared/types"
import { playbackDeviceSellbackValue, usePlaybackDevice } from "../shared/playbackDevice"

export const cassetteDeck = createItem({
  shortId: "cassette-deck",
  definition: {
    name: "Cassette Deck",
    description: "Two wells and a belt that still remembers how. Keep it to play cassettes.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    slotPool: "playback",
    playbackFormats: ["TAPE"],
    coinValue: 80,
    icon: "MonitorSpeaker",
    rarity: "uncommon",
  },
  use: usePlaybackDevice,
  sellbackValue: playbackDeviceSellbackValue,
})
