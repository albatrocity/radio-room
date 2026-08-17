import { z } from "zod"

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
  slotPool: z.enum(["inventory", "collection"]).optional(),
})

export type ItemDefinitionAuthoring = z.infer<typeof itemDefinitionAuthoringSchema>
