import type { IncidentId } from "./schema"

/**
 * Van parts and consumables (M3). Pure catalog data shared by the plugin
 * (item definitions, `compileVan`), Game Studio (offers picker, presets), and
 * web (Van tab slots). Item behavior lives in `plugin-road-trip/items`.
 */

export const ROAD_TRIP_PLUGIN_NAME = "road-trip"

/** Full item definition id for a road-trip item. */
export function roadTripItemId(shortId: string): string {
  return `${ROAD_TRIP_PLUGIN_NAME}:${shortId}`
}

export type PartSlot = "aero" | "engine" | "tires" | "horn" | "membership"

export const PART_SLOTS: readonly { slot: PartSlot; label: string }[] = [
  { slot: "aero", label: "Aero" },
  { slot: "engine", label: "Engine" },
  { slot: "tires", label: "Tires" },
  { slot: "horn", label: "Horn" },
  { slot: "membership", label: "Membership" },
]

export type VanPartSpec = {
  shortId: string
  slot: PartSlot
  name: string
  emoji: string
  description: string
  coinValue: number
  /** Chat copy after the installer's name: "Sam bolted on a turbocharger". */
  installed: string
  speed?: number
  /** Fuel economy multiplier: 0.75 burns a third more per mile. */
  mpg?: number
  immuneTo?: IncidentId[]
  /** Traffic Jam softened to this speed factor, for this share of the duration. */
  jam?: { factor: number; durationScale: number }
  /** Spent on the next waivable fee (roadside, tow), which then costs nothing. */
  waivesNextFee?: true
}

export type VanConsumableSpec = {
  shortId: string
  name: string
  emoji: string
  description: string
  coinValue: number
  /** The incident this item ends while it's running. */
  resolves: IncidentId
}

export const VAN_ITEM_IDS = {
  spoiler: "aero-spoiler",
  turbo: "turbocharger",
  tires: "road-grip-tires",
  horn: "obnoxious-horn",
  aaa: "aaa-card",
  fixAFlat: "fix-a-flat",
  cbRadio: "cb-radio",
} as const

export const VAN_PARTS: readonly VanPartSpec[] = [
  {
    shortId: VAN_ITEM_IDS.spoiler,
    slot: "aero",
    name: "Aerodynamic Spoiler",
    emoji: "🪽",
    description: "Bolt it on for a little extra speed (×1.05).",
    coinValue: 60,
    installed: "bolted on an aerodynamic spoiler",
    speed: 1.05,
  },
  {
    shortId: VAN_ITEM_IDS.turbo,
    slot: "engine",
    name: "Turbocharger",
    emoji: "🔥",
    description: "Much faster (×1.25), but it drinks gas (mpg ×0.75).",
    coinValue: 150,
    installed: "bolted on a turbocharger",
    speed: 1.25,
    mpg: 0.75,
  },
  {
    shortId: VAN_ITEM_IDS.tires,
    slot: "tires",
    name: "Road-Grip Tires",
    emoji: "🛞",
    description: "Slightly faster (×1.04) and they never blow out.",
    coinValue: 90,
    installed: "fitted Road-Grip tires",
    speed: 1.04,
    immuneTo: ["blown-tire"],
  },
  {
    shortId: VAN_ITEM_IDS.horn,
    slot: "horn",
    name: "Obnoxious Horn",
    emoji: "📯",
    description: "Traffic jams crawl at ×0.55 instead of ×0.4 and clear a quarter sooner.",
    coinValue: 40,
    installed: "wired up an obnoxious horn",
    jam: { factor: 0.55, durationScale: 0.75 },
  },
  {
    shortId: VAN_ITEM_IDS.aaa,
    slot: "membership",
    name: "AAA Card",
    emoji: "💳",
    description: "Covers the next roadside service or tow in full (the wait still applies).",
    coinValue: 50,
    installed: "tucked a AAA card in the glovebox",
    waivesNextFee: true,
  },
]

export const VAN_CONSUMABLES: readonly VanConsumableSpec[] = [
  {
    shortId: VAN_ITEM_IDS.fixAFlat,
    name: "Fix-a-Flat",
    emoji: "🧴",
    description: "Use during a blown tire to patch it on the spot.",
    coinValue: 30,
    resolves: "blown-tire",
  },
  {
    shortId: VAN_ITEM_IDS.cbRadio,
    name: "CB Radio",
    emoji: "📻",
    description: "Use during a traffic jam to find a way around it.",
    coinValue: 35,
    resolves: "traffic-jam",
  },
]

export function vanPart(shortId: string): VanPartSpec | undefined {
  return VAN_PARTS.find((part) => part.shortId === shortId)
}

export function vanConsumable(shortId: string): VanConsumableSpec | undefined {
  return VAN_CONSUMABLES.find((item) => item.shortId === shortId)
}

/** Short ids of the consumables that end `incident`. */
export function itemsResolving(incident: IncidentId): string[] {
  return VAN_CONSUMABLES.filter((item) => item.resolves === incident).map((item) => item.shortId)
}

export type VanFactor = { source: string; label: string; factor: number }

export type CompiledVan = {
  speedFactors: VanFactor[]
  mpgFactors: VanFactor[]
  immunities: IncidentId[]
  jam: { factor: number; durationScale: number } | null
  waivesNextFee: boolean
}

/** Installed parts → the motion primitives they compile to (D4). Pure. */
export function compileVan(partIds: readonly string[]): CompiledVan {
  const out: CompiledVan = {
    speedFactors: [],
    mpgFactors: [],
    immunities: [],
    jam: null,
    waivesNextFee: false,
  }
  for (const id of partIds) {
    const part = vanPart(id)
    if (!part) continue
    if (part.speed !== undefined)
      out.speedFactors.push({ source: part.shortId, label: part.name, factor: part.speed })
    if (part.mpg !== undefined)
      out.mpgFactors.push({ source: part.shortId, label: part.name, factor: part.mpg })
    if (part.immuneTo) out.immunities.push(...part.immuneTo)
    if (part.jam) out.jam = part.jam
    if (part.waivesNextFee) out.waivesNextFee = true
  }
  return out
}

export function productOf(factors: readonly { factor: number }[]): number {
  return factors.reduce((product, f) => product * f.factor, 1)
}
