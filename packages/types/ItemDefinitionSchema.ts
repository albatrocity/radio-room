import { z } from "zod"
import { ITEM_SLOT_POOLS, PHYSICAL_MEDIA_FORMATS } from "./Inventory"

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
