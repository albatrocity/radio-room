import type { TripMapInput } from "./schema"

/** Twelve-minute dev map for the Phase 1 playable: skip the Record Store, stop at the stand, arrive. */
export const SAMPLE_TRIP_MAP: TripMapInput = {
  schemaVersion: 1,
  id: "sample-concert-run",
  title: "Concert Run",
  revision: 1,
  route: { driveMinutes: 12, baseMph: 60, tanksPerTrip: 1.6 },
  tuning: {
    parkMinutes: 4,
    revealMiles: 3,
    skipPoll: { leadMinutes: 1.5, durationSec: 45, default: "skip" },
  },
  sites: [
    {
      id: "record-store",
      presetId: "roadside-attraction",
      name: "Dusty Boots Records",
      description: "Crates of used vinyl in a converted gas station.",
      icon: "📀",
      lore: "The owner swears the jukebox in the back only plays songs that haven't been written yet.",
      mile: 4,
    },
    {
      id: "farmers-market",
      presetId: "shop-farmers-market",
      name: "Farmers Market",
      description: "A roadside stand with honey, peaches, and hand-lettered signs.",
      icon: "🍎",
      lore: "Three generations of the same family have run this stand. Ask about the peach wine.",
      mile: 8,
      skipPoll: { default: "stop" },
      shop: {
        shopIds: ["farmers-market"],
        openingMessage: "The stand is open. Grab something for the road.",
      },
    },
    {
      id: "concert",
      presetId: "destination-venue",
      name: "The Concert",
      description: "Lights, sound check, and a crowd waiting.",
      icon: "🎸",
      mile: 12,
      role: "destination",
    },
  ],
}
