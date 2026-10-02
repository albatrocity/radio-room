import type { TripSite } from "./schema"

/** A site-library entry: everything but the id and mile, which the designer sets. */
export type SitePreset = {
  id: string
  label: string
  site: Omit<TripSite, "id" | "mile" | "presetId">
}

/** Generic site-library presets (Phase 1). Gas Station and Mechanic arrive in Phases 2–3. */
export const GENERIC_SITE_PRESETS: SitePreset[] = [
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
