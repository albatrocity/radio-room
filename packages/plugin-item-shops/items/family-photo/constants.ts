export const FAMILY_PHOTO_SHORT_ID = "family-photo"
export const FAMILY_PHOTO_DURATION_MS = 10 * 60 * 1000
export const FAMILY_PHOTO_MAX_DEPTH = 3
export const FAMILY_PHOTO_PERSONA_SHORT_ID = "son"

export const SON_FUNNEL_REASON = "item-shops:son-funnel"
export const SON_FUNNEL_CLAWBACK_REASON = "item-shops:son-funnel-clawback"

/** Inventory shortIds that must not be mirrored to sons. */
export const SON_MIRROR_SKIP_SHORT_IDS = new Set([
  "van-cubby",
  "merch-cash-box",
  "road-case",
  "trailer",
  "crowdfunding-campaign",
])
