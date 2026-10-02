import { z } from "zod"

/**
 * Trip Map v1 (ADR 0202). Phase 1 fields only: later phases add `shop.offers`,
 * `services`, `scriptedEvents`, `model`, and fuel / funds tuning.
 */

export const TRIP_MAP_SCHEMA_VERSION = 1 as const

/** Upper bound on the JSON an admin can load (bytes of UTF-8). */
export const TRIP_MAP_MAX_BYTES = 800 * 1024

export const siteIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Site ids are lowercase letters, digits, and dashes")

export const skipDefaultSchema = z.enum(["stop", "skip"])
export type SkipDefault = z.infer<typeof skipDefaultSchema>

export const revealMilesSchema = z.union([z.number().min(0), z.literal("always")])
export type RevealMiles = z.infer<typeof revealMilesSchema>

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "Asset URLs must be absolute https URLs")

export const siteSkipPollSchema = z.object({
  question: z.string().min(1).max(120).optional(),
  leadMinutes: z.number().positive().max(30).optional(),
  default: skipDefaultSchema.optional(),
  mystery: z.boolean().optional(),
})
export type SiteSkipPoll = z.infer<typeof siteSkipPollSchema>

export const siteShopSchema = z.object({
  title: z.string().min(1).max(60).optional(),
  shopIds: z.array(z.string().min(1)).max(8).optional(),
  openingMessage: z.string().min(1).max(200).optional(),
})
export type SiteShop = z.infer<typeof siteShopSchema>

export const siteSchema = z.object({
  id: siteIdSchema,
  /** Provenance only: which site-library preset the designer started from. */
  presetId: z.string().max(64).optional(),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(160),
  icon: z.string().min(1).max(16),
  imageUrl: httpsUrlSchema.optional(),
  lore: z.string().max(4000).optional(),
  mile: z.number().min(0),
  role: z.literal("destination").optional(),
  mandatory: z.boolean().optional(),
  revealMiles: revealMilesSchema.optional(),
  secret: z.boolean().optional(),
  skipPoll: siteSkipPollSchema.optional(),
  parkMinutes: z.number().positive().max(60).optional(),
  shop: siteShopSchema.optional(),
})
export type TripSite = z.infer<typeof siteSchema>

export const tripRouteSchema = z.object({
  driveMinutes: z
    .number()
    .positive()
    .max(24 * 60),
  baseMph: z.number().positive().max(200).default(55),
  /** Authored for Phase 2 fuel; carried through untouched in Phase 1. */
  tanksPerTrip: z.number().positive().max(20).default(1.6),
  deadlineAt: z.string().datetime({ offset: true }).optional(),
})
export type TripRoute = z.infer<typeof tripRouteSchema>

export const tripTuningSchema = z.object({
  parkMinutes: z.number().positive().max(60).default(4),
  revealMiles: revealMilesSchema.default(10),
  skipPoll: z
    .object({
      leadMinutes: z.number().positive().max(30).default(1.5),
      durationSec: z.number().int().min(5).max(600).default(45),
      default: skipDefaultSchema.default("skip"),
    })
    .default({ leadMinutes: 1.5, durationSec: 45, default: "skip" }),
  /** Flavor-copy picks only. */
  seed: z.number().int().optional(),
})
export type TripTuning = z.infer<typeof tripTuningSchema>

export const tripMapSchema = z.object({
  schemaVersion: z.literal(TRIP_MAP_SCHEMA_VERSION),
  id: siteIdSchema,
  title: z.string().min(1).max(80),
  revision: z.number().int().min(1).default(1),
  route: tripRouteSchema,
  tuning: tripTuningSchema.default({
    parkMinutes: 4,
    revealMiles: 10,
    skipPoll: { leadMinutes: 1.5, durationSec: 45, default: "skip" },
  }),
  sites: z.array(siteSchema).min(1).max(64),
})

/** A parsed map with defaults applied. */
export type TripMap = z.infer<typeof tripMapSchema>
/** The authored JSON shape (defaults optional). */
export type TripMapInput = z.input<typeof tripMapSchema>
