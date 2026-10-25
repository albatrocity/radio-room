import type { TripMapInput } from "./schema"

/**
 * Half-hour dev map for trip branches (ADR 0222): the Welcome Center unlocks
 * a "Local tips" layer (Hidden Falls and a busker), the Scenic Byway forks off
 * at mile 14 and rejoins at mile 22 (skipping the Diner), and a road closure
 * at mile 23 asks the room whether to take the Detour.
 */
export const SAMPLE_BRANCH_MAP: TripMapInput = {
  schemaVersion: 1,
  id: "sample-branches",
  title: "Branching Run",
  revision: 1,
  route: { driveMinutes: 30, baseMph: 60, tanksPerTrip: 0.5 },
  tuning: {
    tankGallons: 15,
    lowFuelPct: 0.15,
    parkMinutes: 2,
    revealMiles: 3,
    skipPoll: { leadMinutes: 1.5, durationSec: 45, default: "skip" },
    funds: { mode: "automatic", windowMinutes: 3 },
  },
  layers: [
    {
      id: "local-tips",
      name: "Local tips",
      icon: "🗺️",
      unlockedNarrative: "The clerk circles a few spots on your map.",
      unlockItems: ["local-map"],
    },
  ],
  routes: [
    {
      id: "scenic-byway",
      name: "Scenic Byway",
      icon: "🌲",
      driveMinutes: 5,
      from: { mile: 14 },
      end: { kind: "rejoin", mile: 22 },
      entry: { kind: "vote", default: "stay" },
    },
    {
      id: "detour",
      name: "Detour",
      icon: "🚧",
      driveMinutes: 4,
      from: { mile: 24 },
      end: { kind: "rejoin", mile: 26 },
      entry: { kind: "outcome" },
    },
  ],
  sites: [
    {
      id: "welcome-center",
      name: "Welcome Center",
      description: "Brochures, maps, and a very enthusiastic clerk.",
      icon: "ℹ️",
      mile: 3,
      mandatory: true,
      onVisit: [{ kind: "unlock", layer: "local-tips" }],
    },
    {
      id: "hidden-falls",
      name: "Hidden Falls",
      description: "A waterfall only the locals know about.",
      icon: "💧",
      mile: 8,
      layer: "local-tips",
      secret: false,
    },
    {
      id: "gas-stop",
      name: "Gas Stop",
      description: "One pump and a vending machine.",
      icon: "⛽",
      mile: 12,
      services: { gas: { pricePerGallon: 4 } },
    },
    {
      id: "overlook",
      name: "Valley Overlook",
      description: "The whole valley, laid out below.",
      icon: "🏞️",
      mile: 2,
      route: "scenic-byway",
      secret: false,
    },
    {
      id: "diner",
      name: "Roadside Diner",
      description: "Pie of the day: whatever's left.",
      icon: "🥧",
      mile: 20,
      secret: false,
    },
    {
      id: "arena",
      name: "The Arena",
      description: "Doors at seven.",
      icon: "🎸",
      mile: 30,
      role: "destination",
    },
  ],
  events: [
    {
      id: "busker",
      name: "Roadside busker",
      icon: "🎻",
      mile: 10,
      layer: "local-tips",
      narrative: "A fiddler at the turnout plays you past.",
    },
    {
      id: "road-closed",
      name: "Road closed",
      icon: "🚧",
      mile: 23,
      narrative: "Cones across the road ahead.",
      effect: { kind: "stop" },
      resolution: [
        {
          kind: "choice",
          question: "Take the detour?",
          seconds: 30,
          default: "wait",
          options: [
            {
              id: "detour",
              label: "Take the detour",
              outcomes: [{ kind: "divert", route: "detour" }],
              narrative: "Down the dirt road we go.",
            },
            { id: "wait", label: "Wait it out", outcomes: [] },
          ],
        },
        { kind: "wait", minutes: 1, label: "Waiting for the crew" },
      ],
    },
  ],
}
