import { z } from "zod"
import {
  PHYSICAL_MEDIA_FORMATS,
  physicalMediaCarrySchema,
  physicalMediaStockSchema,
} from "@repo/types"

/**
 * Trip Map v1 (ADR 0215).
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

/**
 * A condition on site behavior (ADR 0230): an outcome, a narrative case, or a
 * shop offer applies only when it holds. Leaves ask a fact about the trip; today
 * the only one is `has` (the van holds that key item). `not`, `all`, and `any`
 * combine them, at most 4 levels deep with 8 children per list.
 */
export type TripCondition =
  | { has: string }
  | { not: TripCondition }
  | { all: TripCondition[] }
  | { any: TripCondition[] }

export const TRIP_CONDITION_MAX_DEPTH = 4
export const TRIP_CONDITION_MAX_CHILDREN = 8

/** How many levels a condition nests: a leaf is 1. */
export function conditionDepth(condition: TripCondition): number {
  if ("not" in condition) return 1 + conditionDepth(condition.not)
  if ("all" in condition) return 1 + Math.max(0, ...condition.all.map(conditionDepth))
  if ("any" in condition) return 1 + Math.max(0, ...condition.any.map(conditionDepth))
  return 1
}

const conditionNodeSchema: z.ZodType<TripCondition, TripCondition> = z.lazy(() =>
  z.union([
    z.object({ has: siteIdSchema }).strict(),
    z.object({ not: conditionNodeSchema }).strict(),
    z.object({ all: z.array(conditionNodeSchema).min(1).max(TRIP_CONDITION_MAX_CHILDREN) }).strict(),
    z.object({ any: z.array(conditionNodeSchema).min(1).max(TRIP_CONDITION_MAX_CHILDREN) }).strict(),
  ]),
)

export const tripConditionSchema: z.ZodType<TripCondition, TripCondition> =
  conditionNodeSchema.superRefine((condition, ctx) => {
    if (conditionDepth(condition) > TRIP_CONDITION_MAX_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conditions nest at most 4 levels deep.`,
      })
    }
  })

/** Full item definition id, e.g. `road-trip:fix-a-flat`. */
const itemDefinitionIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-z0-9-]+:[A-Za-z0-9_.-]+$/, "Name a full item id like road-trip:fix-a-flat")

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
  /** Listed only when this holds as the shop opens (ADR 0230). */
  when: tripConditionSchema.optional(),
})
export type SiteShopOffer = z.infer<typeof shopOfferSchema>

export const siteShopSampleSchema = z.object({
  /** How many offers each traveler sees. */
  count: z.number().int().min(1).max(8),
  /** Default rarity weights, or the same weight for every offer. */
  weights: z.enum(["rarity", "even"]).default("rarity"),
})
export type SiteShopSample = z.infer<typeof siteShopSampleSchema>

/** A shelf lists at most 12 offers. A sampled pool lists at most 40. */
export const SITE_SHOP_SHELF_CAP = 12
export const SITE_SHOP_POOL_CAP = 40

/**
 * A site's composed shop (ADR 0222, 0224): custom offers, plus the record bin
 * from `services.physicalMedia`. Sites never open Item Shops catalog shops.
 */
export const siteShopSchema = z
  .object({
    title: z.string().min(1).max(60).optional(),
    offers: z.array(shopOfferSchema).max(SITE_SHOP_POOL_CAP).optional(),
    /**
     * When set, `offers` is a candidate pool and each traveler sees `count` picks.
     * Without it, every traveler sees every offer.
     */
    sample: siteShopSampleSchema.optional(),
    /**
     * The shop buys back at this fraction of the item's price (0–1), default 0.
     * Listed offers use their `basePrice`; anything else uses `coinValue`.
     */
    buybackRate: z.number().min(0).max(1).optional(),
    openingMessage: z.string().min(1).max(200).optional(),
  })
  .superRefine((shop, ctx) => {
    const count = shop.offers?.length ?? 0
    const cap = shop.sample ? SITE_SHOP_POOL_CAP : SITE_SHOP_SHELF_CAP
    if (count > cap) {
      ctx.addIssue({
        path: ["offers"],
        code: z.ZodIssueCode.custom,
        message: shop.sample
          ? `A sampled pool can list at most ${SITE_SHOP_POOL_CAP} offers.`
          : `A shelf can list at most ${SITE_SHOP_SHELF_CAP} offers.`,
      })
    }
  })
export type SiteShop = z.infer<typeof siteShopSchema>

export const siteServicesSchema = z.object({
  /** A gas site: stopping fills the tank at this base price (× the session's `costScale`). */
  gas: z.object({ pricePerGallon: z.number().positive().max(1000) }).optional(),
  /** A Mechanic: Engine Failure tows here (M4). */
  mechanic: z.literal(true).optional(),
  /**
   * The record bin (ADR 0222, 0224): designer `picks` plus, with `library`,
   * derived records matching its formats and genres (`library: {}` = every
   * record). Each traveler sees 3, beside the site's `shop.offers`.
   */
  physicalMedia: z
    .union([
      physicalMediaStockSchema.strict(),
      // Maps written before picks put the library filter at the top level.
      // Trips haven't shipped, so lift it rather than migrate.
      physicalMediaCarrySchema.strict().transform((library) => ({ library })),
    ])
    .optional(),
})
export type SiteServices = z.infer<typeof siteServicesSchema>

export const incidentIdSchema = z.enum([
  "traffic-jam",
  "blown-tire",
  "engine-failure",
  "out-of-gas",
])
export type IncidentId = z.infer<typeof incidentIdSchema>

/** Out of Gas only follows an empty tank, so hosts can't trigger it. */
export const triggerableIncidentIdSchema = z.enum(["traffic-jam", "blown-tire", "engine-failure"])
export type TriggerableIncidentId = z.infer<typeof triggerableIncidentIdSchema>
export const TRIGGERABLE_INCIDENT_IDS = triggerableIncidentIdSchema.options

/** System-alert status for chat narrative. Omitted posts the paragraph on its own. */
export const narrativeVariantSchema = z.enum(["info", "success", "warning", "error"])
export type NarrativeVariant = z.infer<typeof narrativeVariantSchema>
export const NARRATIVE_VARIANTS = narrativeVariantSchema.options

/**
 * A site's arrival or departure line (ADR 0238). `site` posts the info-alert
 * row with the site's icon. The other values are alert statuses. Omitted is plain.
 */
export const siteNarrativeVariantSchema = z.enum(["info", "success", "warning", "error", "site"])
export type SiteNarrativeVariant = z.infer<typeof siteNarrativeVariantSchema>
export const SITE_NARRATIVE_VARIANTS = siteNarrativeVariantSchema.options

/**
 * Which van parts and consumables an event answers to (ADR 0228): `jam` (horn,
 * CB Radio), `flat` (Road-Grip Tires, Fix-a-Flat), `engine`, or `none`.
 */
export const eventFamilySchema = z.enum(["jam", "flat", "engine", "none"])
export type EventFamily = z.infer<typeof eventFamilySchema>
export const EVENT_FAMILIES = eventFamilySchema.options

/** `mile`: fires when the van reaches `mile`. `fuel`: replaces Out of Gas when the tank runs dry. */
export const eventTriggerSchema = z.enum(["mile", "fuel"])
export type EventTrigger = z.infer<typeof eventTriggerSchema>

export const eventEffectSchema = z.discriminatedUnion("kind", [
  /** The van crawls at `factor` × its speed for the event's `durationMinutes`. */
  z.object({
    kind: z.literal("slow"),
    factor: z.number().gt(0).lt(1),
    label: z.string().min(1).max(60).optional(),
  }),
  /** The van is held until the resolution chain finishes. */
  z.object({ kind: z.literal("stop") }),
])
export type EventEffect = z.infer<typeof eventEffectSchema>

export const incidentFundPurposeSchema = z.enum(["roadside", "tow", "repair", "delivery"])

/** `"main"` names `map.route`; alternate routes use their own ids (ADR 0222). */
export const MAIN_ROUTE_ID = "main" as const

/**
 * A state change a site visit, event, choice option, or item applies (ADR 0222).
 * Closed list, applied in order by the trip flow's `outcomes.ts` only.
 */
/** Most copies of an item one `give-item` hands each recipient. */
export const GIVE_ITEM_MAX_QTY = 3

/** Applied only when this holds as the outcome list starts (ADR 0230). */
const outcomeWhenSchema = tripConditionSchema.optional()

export const tripOutcomeSchema = z.discriminatedUnion("kind", [
  /** Make a layer's sites and events ahead of the van live. */
  z.object({ kind: z.literal("unlock"), layer: siteIdSchema, when: outcomeWhenSchema }),
  /** Make a layer inert again; commitments (a decided stop, a running event) carry on. */
  z.object({ kind: z.literal("lock"), layer: siteIdSchema, when: outcomeWhenSchema }),
  /** Decide a fork ahead as "take". */
  z.object({ kind: z.literal("divert"), route: siteIdSchema, when: outcomeWhenSchema }),
  /**
   * Put a key item (`map.keyItems`) in the van (ADR 0230). `narrative` is
   * posted instead of the key's `foundNarrative`. A key already held stays put.
   */
  z.object({
    kind: z.literal("give-key"),
    key: siteIdSchema,
    narrative: z.string().min(1).max(2000).optional(),
    when: outcomeWhenSchema,
  }),
  /** Take a key item out of the van. */
  z.object({ kind: z.literal("take-key"), key: siteIdSchema, when: outcomeWhenSchema }),
  /**
   * Hand an inventory item to people (ADR 0230): every online room user, or
   * one of them at random. Key items go in the van with `give-key` instead.
   */
  z.object({
    kind: z.literal("give-item"),
    item: itemDefinitionIdSchema,
    to: z.enum(["everyone", "random"]),
    qty: z.number().int().min(1).max(GIVE_ITEM_MAX_QTY).default(1),
    when: outcomeWhenSchema,
  }),
])
export type TripOutcome = z.infer<typeof tripOutcomeSchema>
export const tripOutcomesSchema = z.array(tripOutcomeSchema).max(8)

export const choiceOptionSchema = z.object({
  id: siteIdSchema,
  label: z.string().min(1).max(60),
  outcomes: tripOutcomesSchema.default([]),
  /** Chat prose posted when this option wins. */
  narrative: z.string().max(2000).optional(),
})
export type ChoiceOption = z.infer<typeof choiceOptionSchema>

const eventMinutesSchema = z.number().positive().max(60)
const eventLabelSchema = z.string().min(1).max(60)
const eventCostSchema = z.number().min(0).max(100_000)

/** One link of an event's resolution chain; compiled to incident steps when it starts. */
export const eventResolutionSchema = z.discriminatedUnion("kind", [
  /**
   * Items that end the event. On a slow effect they end it early; on a stop
   * they open a window. `items` defaults to the family's consumables.
   */
  z.object({
    kind: z.literal("item"),
    items: z.array(z.string().min(1).max(64)).min(1).max(8).optional(),
    windowMinutes: eventMinutesSchema.optional(),
    label: eventLabelSchema.optional(),
  }),
  /** A cost step; omitted fields default by purpose. */
  z.object({
    kind: z.literal("fund"),
    purpose: incidentFundPurposeSchema,
    baseCost: eventCostSchema.optional(),
    provider: eventLabelSchema.optional(),
    waivable: z.boolean().optional(),
  }),
  /**
   * `status` is the headline while this wait runs ("Refuelling", "Fixing the flat").
   * The strip keeps the event name and shows this beside the countdown.
   */
  z.object({
    kind: z.literal("wait"),
    minutes: eventMinutesSchema,
    label: eventLabelSchema.optional(),
    status: z.string().min(1).max(40).optional(),
  }),
  /** A tow to the nearest Mechanic ahead and repairs there, or repairs on the shoulder. */
  z.object({
    kind: z.literal("tow"),
    towCost: eventCostSchema.optional(),
    towWaitMinutes: eventMinutesSchema.optional(),
    repairCost: eventCostSchema.optional(),
    repairMinutes: eventMinutesSchema.optional(),
  }),
  /** A fuel truck delivers a full tank. The only resolution that fills the tank. */
  z.object({
    kind: z.literal("refuel"),
    fee: eventCostSchema.optional(),
    pricePerGallon: z.number().min(0).max(1000).optional(),
    waitMinutes: eventMinutesSchema.optional(),
    status: z.string().min(1).max(40).optional(),
  }),
  /**
   * A room vote whose winning option applies outcomes (ADR 0222). On a stop it
   * holds the van; a slow step hosts it; with no effect the van keeps driving.
   */
  z.object({
    kind: z.literal("choice"),
    question: z.string().min(1).max(120),
    seconds: z.number().int().min(10).max(600).optional(),
    default: siteIdSchema,
    options: z.array(choiceOptionSchema).min(2).max(4),
  }),
])
export type EventResolution = z.infer<typeof eventResolutionSchema>

/** Chat prose `atMinutes` after the event starts, unless it has cleared by then. */
export const eventBeatSchema = z.object({
  atMinutes: z.number().max(240),
  narrative: z.string().min(1).max(2000),
  narrativeVariant: narrativeVariantSchema.optional(),
})
export type EventBeat = z.infer<typeof eventBeatSchema>

/** A trip event (ADR 0228), composed like a site. Server-only: never sent to clients. */
export const tripEventSchema = z.object({
  id: siteIdSchema,
  /** Provenance only: which incident preset the designer started from. */
  presetId: z.string().max(64).optional(),
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(16),
  /** Chat prose posted when the event starts. */
  narrative: z.string().max(2000).optional(),
  narrativeVariant: narrativeVariantSchema.optional(),
  /** Body of the sign posted when it clears. Blank posts the plain "Back on the road". */
  clearedNarrative: z.string().max(500).optional(),
  /** Defaults to `mile`. */
  trigger: eventTriggerSchema.optional(),
  /** Where a `mile` event fires. */
  mile: z.number().min(0).optional(),
  /** Defaults to `none`. */
  family: eventFamilySchema.optional(),
  /** Omitted: the event only narrates; the van keeps driving. */
  effect: eventEffectSchema.optional(),
  /** Length of a `slow` effect. */
  durationMinutes: eventMinutesSchema.optional(),
  resolution: z.array(eventResolutionSchema).max(8).optional(),
  beats: z.array(eventBeatSchema).max(8).optional(),
  /** The route its `mile` is on (default `main`); the mile is local to that route. */
  route: siteIdSchema.optional(),
  /** Inert until this layer unlocks. */
  layer: siteIdSchema.optional(),
  /** Applied when the event starts. */
  outcomes: tripOutcomesSchema.optional(),
})
export type TripEvent = z.infer<typeof tripEventSchema>

/**
 * A conditional site narrative (ADR 0230). The first case whose `when` holds
 * replaces the site's `narrative` (or `departNarrative`); none falls back to it.
 */
export const narrativeCaseSchema = z.object({
  when: tripConditionSchema,
  text: z.string().min(1).max(2000),
  /** Omitted: the site's own variant for that narrative. */
  variant: siteNarrativeVariantSchema.optional(),
})
export type NarrativeCase = z.infer<typeof narrativeCaseSchema>
export const NARRATIVE_CASES_MAX = 8

export const siteSchema = z.object({
  id: siteIdSchema,
  /** Provenance only: which site-library preset the designer started from. */
  presetId: z.string().max(64).optional(),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(160),
  icon: z.string().min(1).max(16),
  imageUrl: httpsUrlSchema.optional(),
  /**
   * Chat prose posted when the van stops here. Separate from the exit sign
   * and from a shop's opening message.
   */
  narrative: z.string().min(1).max(2000).optional(),
  /** System message for `narrative`: an alert status, `site`, or omitted for plain. */
  narrativeVariant: siteNarrativeVariantSchema.optional(),
  /** Arrival narratives by condition; the first match replaces `narrative` (ADR 0230). */
  narrativeCases: z.array(narrativeCaseSchema).max(NARRATIVE_CASES_MAX).optional(),
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
  /** Replaces the van's "Parked" status while stopped here (ADR 0224). */
  parkedStatus: z.string().trim().min(1).max(40).optional(),
  shop: siteShopSchema.optional(),
  services: siteServicesSchema.optional(),
  /** The route its `mile` is on (default `main`); the mile is local to that route. */
  route: siteIdSchema.optional(),
  /** Inert until this layer unlocks. */
  layer: siteIdSchema.optional(),
  /** Applied when the van parks here (a tow-in counts). */
  onVisit: tripOutcomesSchema.optional(),
  /** Applied when the van leaves and the trip is still driving (ADR 0223). */
  onDepart: tripOutcomesSchema.optional(),
  /** Chat prose posted when the van leaves, before `onDepart` applies (ADR 0226). */
  departNarrative: z.string().min(1).max(2000).optional(),
  /** System message for `departNarrative`: an alert status, `site`, or omitted for plain. */
  departNarrativeVariant: siteNarrativeVariantSchema.optional(),
  /** Departure narratives by condition; the first match replaces `departNarrative` (ADR 0230). */
  departNarrativeCases: z.array(narrativeCaseSchema).max(NARRATIVE_CASES_MAX).optional(),
})
export type TripSite = z.infer<typeof siteSchema>

/** A named group of sites and events, inert until unlocked (ADR 0222). */
export const tripLayerSchema = z.object({
  id: siteIdSchema,
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(16),
  /** Sign body when it unlocks. */
  unlockedNarrative: z.string().max(500).optional(),
  /** Sign body when it locks. */
  lockedNarrative: z.string().max(500).optional(),
  /** Ids of the trip's `maps` that unlock it on use (ADR 0227). */
  maps: z.array(siteIdSchema).max(8).optional(),
})
export type TripLayer = z.infer<typeof tripLayerSchema>

/**
 * A map this trip sells (ADR 0227): the inventory item `road-trip:map-{id}`.
 * Using one unlocks every locked layer that lists it in `maps`.
 */
export const TRIP_MAP_DEFAULT_ICON = "🗺️"
export const TRIP_MAP_DEFAULT_COIN_VALUE = 25

export const tripMapItemSchema = z.object({
  id: siteIdSchema,
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(16).default(TRIP_MAP_DEFAULT_ICON),
  description: z.string().min(1).max(160).optional(),
  coinValue: z.number().int().min(0).max(100_000).default(TRIP_MAP_DEFAULT_COIN_VALUE),
})
export type TripMapItem = z.infer<typeof tripMapItemSchema>

/**
 * A key item this trip defines (ADR 0230): the inventory item
 * `road-trip:key-{id}`. It lives in the van, does nothing by itself, and is
 * what `{ has }` conditions read. Held once: giving it again does nothing.
 */
export const TRIP_KEY_ITEM_DEFAULT_ICON = "🔑"

export const tripKeyItemSchema = z.object({
  id: siteIdSchema,
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(16).default(TRIP_KEY_ITEM_DEFAULT_ICON),
  description: z.string().min(1).max(160).optional(),
  /** Chat prose posted when it lands in the van. */
  foundNarrative: z.string().min(1).max(2000).optional(),
  /** Price when a shop sells it without a `basePrice`. */
  coinValue: z.number().int().min(0).max(100_000).default(0),
})
export type TripKeyItem = z.infer<typeof tripKeyItemSchema>

export const junctionDecisionSchema = z.enum(["take", "stay"])
export type JunctionDecision = z.infer<typeof junctionDecisionSchema>

/**
 * Alternate geometry that forks off a parent route (ADR 0222). It rejoins a
 * route at a mile (the fork mile on the parent = "return") or ends at its own
 * destination. The van is on one route at a time.
 */
export const tripAltRouteSchema = z.object({
  id: siteIdSchema.refine((id) => id !== MAIN_ROUTE_ID, `"${MAIN_ROUTE_ID}" names map.route`),
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(16).optional(),
  /** Its own length, authored in minutes at the map's base speed (ADR 0207 d3). */
  driveMinutes: z
    .number()
    .positive()
    .max(24 * 60),
  from: z.object({ route: siteIdSchema.optional(), mile: z.number().min(0) }),
  end: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("rejoin"),
      route: siteIdSchema.optional(),
      mile: z.number().min(0),
    }),
    z.object({ kind: z.literal("destination") }),
  ]),
  /** The fork exists only while this layer is unlocked. */
  layer: siteIdSchema.optional(),
  entry: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("vote"),
      question: z.string().min(1).max(120).optional(),
      leadMinutes: z.number().positive().max(30).optional(),
      default: junctionDecisionSchema.default("stay"),
      mystery: z.boolean().optional(),
    }),
    /** Only a `divert` outcome takes it. */
    z.object({ kind: z.literal("outcome") }),
  ]),
})
export type TripAltRoute = z.infer<typeof tripAltRouteSchema>

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
const DEFAULT_VAN_PLAYBACK = { formats: [...PHYSICAL_MEDIA_FORMATS], gentle: false }

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
  /**
   * The van counts as a playback device while the map is loaded (ADR 0223).
   * `gentle` plays records without wear, like a hi-fi device.
   */
  vanPlayback: z
    .object({
      formats: z
        .array(z.enum(PHYSICAL_MEDIA_FORMATS))
        .max(PHYSICAL_MEDIA_FORMATS.length)
        .default([...PHYSICAL_MEDIA_FORMATS]),
      gentle: z.boolean().default(false),
    })
    .default(DEFAULT_VAN_PLAYBACK),
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
    vanPlayback: DEFAULT_VAN_PLAYBACK,
  }),
  sites: z.array(siteSchema).min(1).max(64),
  events: z.array(tripEventSchema).max(32).optional(),
  layers: z.array(tripLayerSchema).max(8).optional(),
  routes: z.array(tripAltRouteSchema).max(8).optional(),
  maps: z.array(tripMapItemSchema).max(16).optional(),
  keyItems: z.array(tripKeyItemSchema).max(16).optional(),
})

/** A parsed map with defaults applied. */
export type TripMap = z.infer<typeof tripMapSchema>
/** The authored JSON shape (defaults optional). */
export type TripMapInput = z.input<typeof tripMapSchema>
