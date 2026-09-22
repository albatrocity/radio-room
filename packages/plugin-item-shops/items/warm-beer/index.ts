import { createItem } from "../shared/types"
import { queueRepositionEffect } from "../shared/queueRepositionEffect"

export const warmBeer = createItem({
  shortId: "warm-beer",
  definition: {
    name: "Warm Beer",
    description: "Hey, not bad. Move any song up 1 position in the queue.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "queueItem",
    coinValue: 10,
    icon: "Beer",
    rarity: "common",
  },
  use: queueRepositionEffect({
    delta: -1,
    messages: {
      selectTarget: "Select a track to promote.",
      success: "Track promoted!",
      announce: ({ actor, trackTitle, victimUsername, isOwnTrack }) => {
        if (victimUsername) {
          if (isOwnTrack) {
            return `Slurp! ${actor} cracked a Warm Beer and promoted their own track, "${trackTitle}"!`
          }
          return `Slurp! ${actor} cracked a Warm Beer and promoted ${victimUsername}'s track, "${trackTitle}"!`
        }
        return `Slurp! ${actor} cracked a Warm Beer and promoted a track, "${trackTitle}"!`
      },
    },
  }),
})
