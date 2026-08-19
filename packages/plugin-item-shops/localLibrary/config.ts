import { z } from "zod"
import { itemDefinitionAuthoringSchema, itemRaritySchema } from "@repo/types"

/** Grant-only fields composed onto {@link itemDefinitionAuthoringSchema}. */
export const localLibraryGrantConfigSchema = itemDefinitionAuthoringSchema.extend({
  scope: z.enum(["library", "playlist"]),
  /** Navidrome playlist id when `scope` is `playlist`; ignored for `library`. */
  playlistId: z.string().default(""),
  /**
   * `perQueue` (default) consumes one stack unit when a matching track is queued.
   * `durable` grants unlimited queueing from the record for the game session.
   */
  redemption: z.enum(["durable", "perQueue"]).default("perQueue"),
})

export type LocalLibraryGrantConfig = z.infer<typeof localLibraryGrantConfigSchema>

/**
 * Extra operator-authored grants. Physical Media is derived from Navidrome.
 * Defaults are empty.
 */
export const DEFAULT_LOCAL_LIBRARY_GRANTS: LocalLibraryGrantConfig[] = []

export const physicalMediaOverrideSchema = z.object({
  playlistId: z.string().min(1),
  name: z.string().optional(),
  coinValue: z.number().int().nonnegative().optional(),
  rarity: itemRaritySchema.optional(),
  icon: z.string().optional(),
})

export type PhysicalMediaOverride = z.infer<typeof physicalMediaOverrideSchema>
