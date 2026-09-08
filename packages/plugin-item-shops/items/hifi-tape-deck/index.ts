import { createItem } from "../shared/types"
import { playbackDeviceSellbackValue, usePlaybackDevice } from "../shared/playbackDevice"

export const hifiTapeDeck = createItem({
  shortId: "hifi-tape-deck",
  definition: {
    name: "Hifi Tape Deck",
    description:
      "Studio-grade transport and heads. Plays cassettes without putting stress on the tape.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    slotPool: "playback",
    playbackFormats: ["TAPE"],
    gentlePlayback: true,
    coinValue: 300,
    icon: "CassetteTape",
    rarity: "legendary",
  },
  use: usePlaybackDevice,
  sellbackValue: playbackDeviceSellbackValue,
})
