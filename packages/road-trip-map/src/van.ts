import type { EventFamily } from "./schema"

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
  /** Event families this part shrugs off (ADR 0220). */
  immuneTo?: EventFamily[]
  /** The sign posted when it shrugs one off. */
  immuneCopy?: { title: string; body: string }
  /** `jam` slowdowns crawl no slower than this factor, for this share of the duration. */
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
  /** The event family this item ends by default while one is running. */
  resolves: EventFamily
  /** The sign when it does; `title` follows the user's name ("Sam patched the tire"). */
  resolvedCopy: { title: string; body: string }
  /** Teaser on a slowdown's start sign when this item can end it. */
  hint?: string
}

/** "Save it for a traffic jam." */
export const EVENT_FAMILY_LABELS: Record<EventFamily, string> = {
  jam: "traffic jam",
  flat: "blown tire",
  engine: "breakdown",
  none: "roadside incident",
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
    immuneTo: ["flat"],
    immuneCopy: {
      title: "Road-Grip tires to the rescue",
      body: "Something sharp on the road. The enhanced tires handle it without a problem.",
    },
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
    resolves: "flat",
    resolvedCopy: { title: "patched the tire", body: "Fix-a-Flat to the rescue. Back on the road." },
  },
  {
    shortId: VAN_ITEM_IDS.cbRadio,
    name: "CB Radio",
    emoji: "📻",
    description: "Use during a traffic jam to find a way around it.",
    coinValue: 35,
    resolves: "jam",
    resolvedCopy: {
      title: "found a way around",
      body: "A trucker on channel 19 knew a back road. Back to cruising speed.",
    },
    hint: "Maybe some radio communication will help.",
  },
]

export function vanPart(shortId: string): VanPartSpec | undefined {
  return VAN_PARTS.find((part) => part.shortId === shortId)
}

export function vanConsumable(shortId: string): VanConsumableSpec | undefined {
  return VAN_CONSUMABLES.find((item) => item.shortId === shortId)
}

/** Short ids of the consumables that end `family` events by default. */
export function itemsResolving(family: EventFamily): string[] {
  return VAN_CONSUMABLES.filter((item) => item.resolves === family).map((item) => item.shortId)
}

/** The first installed part that shrugs off `family`. */
export function immunePart(partIds: readonly string[], family: EventFamily): VanPartSpec | undefined {
  return partIds.map(vanPart).find((part) => part?.immuneTo?.includes(family))
}

export type VanFactor = { source: string; label: string; factor: number }

export type CompiledVan = {
  speedFactors: VanFactor[]
  mpgFactors: VanFactor[]
  immunities: EventFamily[]
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
