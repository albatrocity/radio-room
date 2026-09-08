/**
 * Shared Physical Media display / identity helpers for plugin + web.
 * Catalog SKU wiring (format → broken definition) stays in Item Shops.
 */

import {
  PHYSICAL_MEDIA_ORIGIN_KEY,
  PHYSICAL_MEDIA_ORIGIN_TITLE_KEY,
} from "@repo/types"

/** Broken Inventory SKU shortIds (Scratched CD / Dusty Record / Tangled Tape). */
export const BROKEN_MEDIA_SHORT_IDS = [
  "scratched-cd",
  "dusty-record",
  "tangled-tape",
] as const

export type BrokenMediaShortId = (typeof BROKEN_MEDIA_SHORT_IDS)[number]

const BROKEN_MEDIA_SHORT_ID_SET = new Set<string>(BROKEN_MEDIA_SHORT_IDS)

export function isBrokenMediaShortId(shortId: string | undefined): boolean {
  return shortId != null && BROKEN_MEDIA_SHORT_ID_SET.has(shortId)
}

const FORMAT_NAME_PREFIX = /^(CD|LP|Cassette|45):\s+/i

/** Strip the `LP: ` shop prefix so toast / hint copy can use the album title. */
export function albumTitleFromItemName(name: string): string {
  const stripped = name.replace(FORMAT_NAME_PREFIX, "").trim()
  return stripped || name
}

/** Metadata written when converting a Physical Media copy to a broken SKU. */
export function brokenMediaConvertMetadata(opts: {
  originDefinitionId: string
  originRecordName: string
}): Record<string, string> {
  return {
    [PHYSICAL_MEDIA_ORIGIN_KEY]: opts.originDefinitionId,
    [PHYSICAL_MEDIA_ORIGIN_TITLE_KEY]: albumTitleFromItemName(opts.originRecordName),
  }
}

/** Inventory / detail hint when a broken stack's mediaOrigin resolves. */
export function brokenMediaOriginHint(albumTitle: string): string {
  return `This looks like ${albumTitle}, but it's hard to tell`
}

/** CatalogBrowse empty state when the open myMedia album left Collection. */
export const STALE_PHYSICAL_MEDIA_EMPTY = "This copy wore out."

/** Appended to broken→Poor restore success body. */
export const BROKEN_RESTORE_CAVEAT = "It's playable again, but just barely."

/** Join catalog description with an optional origin hint for inventory UI. */
export function inventoryItemDescription(
  description: string | undefined,
  originHint: string | undefined,
): string | undefined {
  if (originHint == null) return description
  const joined = [description, originHint].filter(Boolean).join(" ")
  return joined || undefined
}
