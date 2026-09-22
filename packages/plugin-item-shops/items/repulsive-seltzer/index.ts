import { createItem } from "../shared/types"
import { queueRepositionEffect } from "../shared/queueRepositionEffect"

export const repulsiveSeltzer = createItem({
  shortId: "repulsive-seltzer",
  definition: {
    name: "Repulsive Seltzer",
    description:
      "Salami Lavender?? Who's designing these flavors? Move any song down 1 position in the queue.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "queueItem",
    coinValue: 25,
    icon: "Refrigerator",
    rarity: "uncommon",
  },
  use: queueRepositionEffect({
    delta: 1,
    messages: {
      selectTarget: "Select a track to demote.",
      success: "Track demoted!",
      announce: ({ actor, trackTitle, victimUsername, isOwnTrack }) => {
        if (victimUsername) {
          if (isOwnTrack) {
            return `Yuck! ${actor} drank a Repulsive Seltzer to demote their own track, "${trackTitle}"!`
          }
          return `Yuck! ${actor} drank a Repulsive Seltzer to demote ${victimUsername}'s track, "${trackTitle}"!`
        }
        return `Yuck! ${actor} drank a Repulsive Seltzer to demote a track, "${trackTitle}"!`
      },
    },
  }),
})
