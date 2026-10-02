import type { TripMapInput } from "./schema"

/**
 * Twelve-minute dev map for the Phase 1–3 playables: skip the Record Store,
 * fill up at the gas station (low fuel makes it stop; Fix-a-Flat on the
 * counter), stop at the stand, blow a tire at mile 9, pass Hank's Garage, arrive.
 */
export const SAMPLE_TRIP_MAP: TripMapInput = {
  schemaVersion: 1,
  id: "sample-concert-run",
  title: "Concert Run",
  revision: 1,
  route: { driveMinutes: 12, baseMph: 60, tanksPerTrip: 1.8 },
  tuning: {
    tankGallons: 15,
    lowFuelPct: 0.15,
    parkMinutes: 4,
    revealMiles: 3,
    skipPoll: { leadMinutes: 1.5, durationSec: 45, default: "skip" },
    funds: { mode: "automatic", windowMinutes: 3 },
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
      id: "gas-n-go",
      presetId: "gas-station",
      name: "Gas 'n' Go",
      description: "Two pumps, a humming ice machine, and a hand-lettered price sign.",
      icon: "⛽",
      mile: 6,
      parkMinutes: 2,
      services: { gas: { pricePerGallon: 8 } },
      shop: {
        title: "Gas 'n' Go counter",
        offers: [{ definitionId: "road-trip:fix-a-flat" }, { definitionId: "road-trip:aaa-card" }],
      },
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
    {
      id: "hanks-garage",
      presetId: "mechanic",
      name: "Hank's Garage",
      description: "Oil-stained bays, a radio tuned to the ballgame, and parts for days.",
      icon: "🔧",
      mile: 10,
      services: { mechanic: true },
      shop: {
        title: "Hank's parts counter",
        offers: [
          { definitionId: "road-trip:aero-spoiler" },
          { definitionId: "road-trip:turbocharger" },
          { definitionId: "road-trip:road-grip-tires" },
          { definitionId: "road-trip:obnoxious-horn" },
          { definitionId: "road-trip:cb-radio" },
        ],
      },
    },
  ],
  scriptedEvents: [{ id: "flat-at-9", atMile: 9, incident: "blown-tire" }],
}
