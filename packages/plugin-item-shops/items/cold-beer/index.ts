import { createItem } from "../shared/types"
import { queueRepositionEffect } from "../shared/queueRepositionEffect"

export const coldBeer = createItem({
  shortId: "cold-beer",
  definition: {
    name: "Cold Beer",
    description: "Now that's refreshing! Move any song up +2 in the queue.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "queueItem",
    coinValue: 50,
    icon: "Beer",
    rarity: "rare",
  },
  use: queueRepositionEffect({
    delta: -2,
    messages: {
      selectTarget: "Select a track to promote.",
      success: "Track promoted!",
      announce: ({ actor, trackTitle, victimUsername, isOwnTrack }) => {
        if (victimUsername) {
          if (isOwnTrack) {
            return `Slurp! ${actor} cracked a Cold Beer and promoted their own track, "${trackTitle}"!`
          }
          return `Slurp! ${actor} cracked a Cold Beer and promoted ${victimUsername}'s track, "${trackTitle}"!`
        }
        return `Slurp! ${actor} cracked a Cold Beer and promoted a track, "${trackTitle}"!`
      },
    },
  }),
})
