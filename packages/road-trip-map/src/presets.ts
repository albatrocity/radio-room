import type { TripSite } from "./schema"
import { VAN_ITEM_IDS, roadTripItemId } from "./van"

/** A site-library entry: everything but the id and mile, which the designer sets. */
export type SitePreset = {
  id: string
  label: string
  site: Omit<TripSite, "id" | "mile" | "presetId">
}

/** Generic site-library presets. */
export const GENERIC_SITE_PRESETS: SitePreset[] = [
  {
    id: "gas-station",
    label: "Gas station",
    site: {
      name: "Gas 'n' Go",
      description: "Two pumps, a humming ice machine, and a hand-lettered price sign.",
      icon: "⛽",
      parkMinutes: 2,
      services: { gas: { pricePerGallon: 8 } },
      shop: {
        title: "Gas 'n' Go counter",
        offers: [
          { definitionId: roadTripItemId(VAN_ITEM_IDS.fixAFlat) },
          { definitionId: roadTripItemId(VAN_ITEM_IDS.aaa) },
        ],
      },
    },
  },
  {
    id: "mechanic",
    label: "Mechanic",
    site: {
      name: "Hank's Garage",
      description: "Oil-stained bays, a radio tuned to the ballgame, and parts for days.",
      icon: "🔧",
      services: { mechanic: true },
      shop: {
        title: "Hank's parts counter",
        offers: [
          { definitionId: roadTripItemId(VAN_ITEM_IDS.spoiler) },
          { definitionId: roadTripItemId(VAN_ITEM_IDS.turbo) },
          { definitionId: roadTripItemId(VAN_ITEM_IDS.tires) },
          { definitionId: roadTripItemId(VAN_ITEM_IDS.horn) },
          { definitionId: roadTripItemId(VAN_ITEM_IDS.fixAFlat) },
          { definitionId: roadTripItemId(VAN_ITEM_IDS.cbRadio) },
        ],
      },
    },
  },
  {
    id: "destination-venue",
    label: "Venue (destination)",
    site: {
      name: "The Venue",
      description: "Lights, sound check, and a crowd waiting. You made it.",
      icon: "🎸",
      role: "destination",
    },
  },
  {
    id: "scenic-overlook",
    label: "Scenic overlook",
    site: {
      name: "Scenic Overlook",
      description: "A gravel pull-off with a view worth the stop.",
      icon: "🏞️",
    },
  },
  {
    id: "roadside-attraction",
    label: "Roadside attraction",
    site: {
      name: "World's Largest Something",
      description: "Hand-painted signs for the last forty miles promised this.",
      icon: "🗿",
    },
  },
  {
    id: "mystery-stop",
    label: "Mystery stop",
    site: {
      name: "Unmarked Exit",
      description: "No sign, just a dirt road and a flickering light.",
      icon: "❓",
      skipPoll: { mystery: true },
    },
  },
]

/** Preset for a site that opens one Item Shops catalog shop as a roadside stand (D14). */
export function sitePresetForShop(shop: {
  shopId: string
  name: string
  icon?: string
  description?: string
}): SitePreset {
  return {
    id: `shop-${shop.shopId}`,
    label: shop.name,
    site: {
      name: shop.name,
      description: shop.description ?? `Pull off and browse ${shop.name}.`,
      icon: shop.icon ?? "🛍️",
      shop: { shopIds: [shop.shopId] },
    },
  }
}

/** Instantiate a preset at a mile with a unique id. */
export function siteFromPreset(preset: SitePreset, id: string, mile: number): TripSite {
  return { ...structuredClone(preset.site), id, mile, presetId: preset.id }
}
