import { z } from "zod"

/**
 * Trip Map v1 (ADR 0202).
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

const glbUrlSchema = httpsUrlSchema.refine((value) => {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".glb")
  } catch {
    return false
  }
}, "3D models must be .glb files")

/** A site's 3D model (glTF Binary), shown in site detail once visited (D12a). */
export const siteModelSchema = z.object({ url: glbUrlSchema })
export type SiteModel = z.infer<typeof siteModelSchema>

export const siteSkipPollSchema = z.object({
  question: z.string().min(1).max(120).optional(),
  leadMinutes: z.number().positive().max(30).optional(),
  default: skipDefaultSchema.optional(),
  mystery: z.boolean().optional(),
})
export type SiteSkipPoll = z.infer<typeof siteSkipPollSchema>

/** Any registered item by full definition id (D14), e.g. `road-trip:fix-a-flat`. */
export const shopOfferSchema = z.object({
  definitionId: z
    .string()
    .min(3)
    .max(128)
    .regex(/^[a-z0-9-]+:[A-Za-z0-9_.-]+$/, "Offers name a full item id like road-trip:fix-a-flat"),
  /** Unscaled price; defaults to the item's `coinValue`. */
  basePrice: z.number().int().min(0).max(100_000).optional(),
  /** Units each traveler can buy per stop (default 1). */
  stock: z.number().int().min(1).max(99).optional(),
})
export type SiteShopOffer = z.infer<typeof shopOfferSchema>

export const siteShopSchema = z.object({
  title: z.string().min(1).max(60).optional(),
  shopIds: z.array(z.string().min(1)).max(8).optional(),
  offers: z.array(shopOfferSchema).max(12).optional(),
  openingMessage: z.string().min(1).max(200).optional(),
})
export type SiteShop = z.infer<typeof siteShopSchema>

export const siteServicesSchema = z.object({
  /** A gas site: stopping fills the tank at this base price (× the session's `costScale`). */
  gas: z.object({ pricePerGallon: z.number().positive().max(1000) }).optional(),
  /** A Mechanic: Engine Failure tows here (M4). */
  mechanic: z.literal(true).optional(),
})
export type SiteServices = z.infer<typeof siteServicesSchema>

export const incidentIdSchema = z.enum(["traffic-jam", "blown-tire", "engine-failure", "out-of-gas"])
export type IncidentId = z.infer<typeof incidentIdSchema>

/** Out of Gas only follows an empty tank, so it can't be triggered or scripted. */
export const triggerableIncidentIdSchema = z.enum(["traffic-jam", "blown-tire", "engine-failure"])
export type TriggerableIncidentId = z.infer<typeof triggerableIncidentIdSchema>
export const TRIGGERABLE_INCIDENT_IDS = triggerableIncidentIdSchema.options

/** A story beat at a mile marker (D23). Server-only: never sent to clients. */
export const scriptedEventSchema = z.object({
  id: siteIdSchema,
  atMile: z.number().min(0),
  incident: triggerableIncidentIdSchema,
})
export type ScriptedEvent = z.infer<typeof scriptedEventSchema>

export const siteSchema = z.object({
  id: siteIdSchema,
  /** Provenance only: which site-library preset the designer started from. */
  presetId: z.string().max(64).optional(),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(160),
  icon: z.string().min(1).max(16),
  imageUrl: httpsUrlSchema.optional(),
  lore: z.string().max(4000).optional(),
  model: siteModelSchema.optional(),
  mile: z.number().min(0),
  role: z.literal("destination").optional(),
  mandatory: z.boolean().optional(),
  revealMiles: revealMilesSchema.optional(),
  /** Hidden from players until revealed (default). `false` shows a `?` marker for it up ahead. */
  secret: z.boolean().optional(),
  skipPoll: siteSkipPollSchema.optional(),
  parkMinutes: z.number().positive().max(60).optional(),
  shop: siteShopSchema.optional(),
  services: siteServicesSchema.optional(),
})
export type TripSite = z.infer<typeof siteSchema>

export const tripRouteSchema = z.object({
  driveMinutes: z
    .number()
    .positive()
    .max(24 * 60),
  baseMph: z.number().positive().max(200).default(55),
  /** Full tanks the whole route burns at base economy (D6); mpg is derived from it. */
  tanksPerTrip: z.number().positive().max(20).default(1.6),
  deadlineAt: z.string().datetime({ offset: true }).optional(),
})
export type TripRoute = z.infer<typeof tripRouteSchema>

export const fundsModeSchema = z.enum(["automatic", "voluntary"])
export type FundsMode = z.infer<typeof fundsModeSchema>

const DEFAULT_SKIP_POLL = { leadMinutes: 1.5, durationSec: 45, default: "skip" as const }
const DEFAULT_FUNDS = { mode: "automatic" as const, windowMinutes: 3 }

export const tripTuningSchema = z.object({
  /** Cosmetic tank size: the gauge and gas quotes are in gallons. */
  tankGallons: z.number().positive().max(500).default(15),
  /** Below this share of a tank, gas sites default to "stop" and the copy turns urgent. */
  lowFuelPct: z.number().min(0).max(0.9).default(0.15),
  parkMinutes: z.number().positive().max(60).default(4),
  revealMiles: revealMilesSchema.default(10),
  skipPoll: z
    .object({
      leadMinutes: z.number().positive().max(30).default(DEFAULT_SKIP_POLL.leadMinutes),
      durationSec: z.number().int().min(5).max(600).default(DEFAULT_SKIP_POLL.durationSec),
      default: skipDefaultSchema.default(DEFAULT_SKIP_POLL.default),
    })
    .default(DEFAULT_SKIP_POLL),
  /** How trip costs are paid (D15–D17): a proportional levy, or a pool the room chips into. */
  funds: z
    .object({
      mode: fundsModeSchema.default(DEFAULT_FUNDS.mode),
      /** Voluntary pools stay open this long unless the goal is met first. */
      windowMinutes: z.number().positive().max(30).default(DEFAULT_FUNDS.windowMinutes),
    })
    .default(DEFAULT_FUNDS),
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
    tankGallons: 15,
    lowFuelPct: 0.15,
    parkMinutes: 4,
    revealMiles: 10,
    skipPoll: DEFAULT_SKIP_POLL,
    funds: DEFAULT_FUNDS,
  }),
  sites: z.array(siteSchema).min(1).max(64),
  scriptedEvents: z.array(scriptedEventSchema).max(32).optional(),
})

/** A parsed map with defaults applied. */
export type TripMap = z.infer<typeof tripMapSchema>
/** The authored JSON shape (defaults optional). */
export type TripMapInput = z.input<typeof tripMapSchema>
