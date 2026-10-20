import { z } from "zod"
import {
  ITEM_SLOT_POOLS,
  MAX_RECORD_PICKS,
  PHYSICAL_MEDIA_FORMATS,
  PICKABLE_RECORD_SOURCES,
} from "./Inventory"

/**
 * Authorable slice of an inventory item definition (no `id` / `sourcePlugin`).
 * Used by config-driven catalogs (e.g. Item Shops local library grants) and aligned
 * with fields plugins pass into `createItem` / `ItemCatalogEntry["definition"]`.
 */
export const itemRaritySchema = z.enum(["common", "uncommon", "rare", "legendary"])

export const itemDefinitionAuthoringSchema = z.object({
  shortId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Lucide icon name (PascalCase). */
  icon: z.string().optional(),
  stackable: z.boolean().default(true),
  maxStack: z.number().int().positive().default(5),
  tradeable: z.boolean().default(true),
  consumable: z.boolean().default(false),
  coinValue: z.number().int().nonnegative().optional(),
  rarity: itemRaritySchema.optional(),
  slotPool: z.enum(ITEM_SLOT_POOLS).optional(),
  playbackFormats: z.array(z.enum(PHYSICAL_MEDIA_FORMATS)).optional(),
  /** Skip Physical Media wear when this device covers the queued copy (ADR 0166). */
  gentlePlayback: z.boolean().optional(),
  /** Max stash content entries; presence marks a reusable container (ADR 0179). */
  storageCapacity: z.number().int().positive().optional(),
  detailView: z
    .object({
      actionLabel: z.string().optional(),
      /** Lucide icon name (PascalCase). */
      actionIcon: z.string().optional(),
      iconOnly: z.boolean().optional(),
      layout: z.enum(["default", "trackList", "punchCard"]).optional(),
      countNoun: z
        .object({
          singular: z.string().min(1),
          plural: z.string().min(1),
        })
        .optional(),
    })
    .optional(),
})

export type ItemDefinitionAuthoring = z.infer<typeof itemDefinitionAuthoringSchema>

/** Zod shape of `PhysicalMediaCarry` for trip maps and capability requests (ADR 0214). */
export const physicalMediaCarrySchema = z.object({
  formats: z.array(z.enum(PHYSICAL_MEDIA_FORMATS)).max(PHYSICAL_MEDIA_FORMATS.length).optional(),
  genres: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
})

/** Zod shape of `PhysicalMediaPick` (ADR 0216). */
export const physicalMediaPickSchema = z.object({
  source: z.enum(PICKABLE_RECORD_SOURCES),
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  year: z.number().int().min(1800).max(3000).optional(),
  trackCount: z.number().int().min(1).max(500),
  imageUrl: z.string().url().max(2000).optional(),
  format: z.enum(PHYSICAL_MEDIA_FORMATS).optional(),
  lore: z.string().trim().min(1).max(2000).optional(),
})

/** Zod shape of `PhysicalMediaStock` (ADR 0216). */
export const physicalMediaStockSchema = z.object({
  library: physicalMediaCarrySchema.optional(),
  picks: z.array(physicalMediaPickSchema).max(MAX_RECORD_PICKS).optional(),
})
