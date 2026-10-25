import { ITEM_CATALOG } from "@repo/plugin-item-shops"
import {
  parseTripMap,
  roadTripItemId,
  SAMPLE_TRIP_MAP,
  tripMapSchema,
  VAN_CONSUMABLES,
  VAN_PARTS,
  type TripMapInput,
} from "@repo/road-trip-map"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { describe, expect, it } from "vitest"
import { sampleComposableOffers } from "@repo/game-logic"
import {
  addBlankEvent,
  addBlankSite,
  addEventFromPreset,
  estimateEvent,
  EVENT_PRESET_BUTTONS,
  hasFuelEvent,
  liftDraft,
  mapJson,
  moveEvent,
  OFFER_CATALOG,
  parseDraft,
  previewOfferSample,
  removeEvent,
  siteSlugFromName,
  updateEvent,
  validateCatalogShop,
} from "./tripMapDraft"

describe("OFFER_CATALOG", () => {
  it("includes every Item Shops catalog entry and every van item", () => {
    const ids = new Set(OFFER_CATALOG.map((option) => option.definitionId))
    expect(ids.size).toBe(OFFER_CATALOG.length)
    for (const entry of ITEM_CATALOG) {
      const definitionId = `${ITEM_SHOPS_PLUGIN_NAME}:${entry.definition.shortId}`
      const option = OFFER_CATALOG.find((item) => item.definitionId === definitionId)
      expect(option).toMatchObject({
        name: entry.definition.name,
        plugin: "item-shops",
        coinValue: entry.definition.coinValue ?? 0,
        rarity: entry.definition.rarity ?? "common",
      })
      if (entry.availableInRoomTypes) {
        expect(option?.roomTypes).toEqual([...entry.availableInRoomTypes])
      } else {
        expect(option?.roomTypes).toBeUndefined()
      }
    }
    for (const item of [...VAN_PARTS, ...VAN_CONSUMABLES]) {
      expect(OFFER_CATALOG.find((option) => option.definitionId === roadTripItemId(item.shortId))).toMatchObject({
        name: item.name,
        icon: item.emoji,
        coinValue: item.coinValue,
        plugin: "road-trip",
      })
    }
  })

  it("notes shop effects that do not follow an item into a composed shop", () => {
    expect(OFFER_CATALOG.find((option) => option.definitionId === "item-shops:fuzz-pedal")?.outsideShopNote).toBe(
      "behaves differently outside Sweetwater",
    )
    expect(OFFER_CATALOG.find((option) => option.definitionId === "item-shops:warm-beer")?.outsideShopNote).toBe(
      "behaves differently outside Green Room",
    )
    expect(OFFER_CATALOG.find((option) => option.definitionId === "item-shops:carrots")?.outsideShopNote).toBeUndefined()
  })
})

describe("validateCatalogShop", () => {
  it("accepts a listed id and rejects an unknown one", () => {
    const listed = OFFER_CATALOG.find((option) => option.definitionId === "item-shops:fuzz-pedal")
    expect(listed).toBeDefined()
    expect(validateCatalogShop({ offers: [{ definitionId: listed!.definitionId }] })).toEqual({ ok: true })
    expect(validateCatalogShop({ offers: [{ definitionId: "road-trip:jetpack" }] })).toEqual({
      ok: false,
      errors: ['Unknown item "road-trip:jetpack"'],
    })
  })

  it("warns when an offer is only sold in some room types", () => {
    expect(validateCatalogShop({ offers: [{ definitionId: "item-shops:beat-detector" }] })).toEqual({
      ok: true,
      warnings: ["Beat Detector isn't sold in every room (radio only); the van still stops"],
    })
  })

  it("surfaces that warning from parseDraft", () => {
    const draft = structuredClone(SAMPLE_TRIP_MAP)
    draft.sites[0]!.shop = { offers: [{ definitionId: "item-shops:beat-detector" }] }
    const result = parseDraft(draft, Date.now())
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "shop-availability",
          message: expect.stringContaining(
            "Beat Detector isn't sold in every room (radio only); the van still stops",
          ),
        }),
      ]),
    )
  })
})

describe("addBlankSite", () => {
  it("adds a site with the typed name and slug and no preset", () => {
    const result = addBlankSite(SAMPLE_TRIP_MAP, { name: "Roadside Diner", slug: "roadside-diner" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const site = result.draft.sites.find((item) => item.id === "roadside-diner")
    expect(site).toMatchObject({ name: "Roadside Diner", icon: "📍" })
    expect(site?.presetId).toBeUndefined()
    expect(site?.mile).toBeGreaterThan(0)
  })

  it("rejects a bad slug and a slug already on the map", () => {
    expect(addBlankSite(SAMPLE_TRIP_MAP, { name: "Diner", slug: "Roadside Diner" }).ok).toBe(false)
    expect(addBlankSite(SAMPLE_TRIP_MAP, { name: "Again", slug: "gas-n-go" }).ok).toBe(false)
    expect(siteSlugFromName("Roadside Diner!")).toBe("roadside-diner")
  })
})

describe("previewOfferSample", () => {
  /** Deterministic sequence so the preview and the runtime see the same draws. */
  function seq(values: number[]) {
    let i = 0
    return () => values[i++ % values.length]!
  }

  const pool = OFFER_CATALOG.slice(0, 6).map((o) => ({ definitionId: o.definitionId }))

  it("shows the whole pool, in shelf order, when the count covers it", () => {
    expect(previewOfferSample(pool, { count: 8 }, seq([0.5]))).toEqual(
      OFFER_CATALOG.slice(0, 6).map((o) => o.name),
    )
  })

  it("draws count distinct picks, exactly as a live stop would", () => {
    const draws = [0.9, 0.1, 0.5, 0.3]
    const picked = previewOfferSample(pool, { count: 3 }, seq(draws))
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
    const runtime = sampleComposableOffers(
      OFFER_CATALOG.slice(0, 6).map((o) => ({
        ...o,
        shortId: o.definitionId.slice(o.definitionId.indexOf(":") + 1),
      })),
      { count: 3 },
      seq(draws),
    ).map((o) => o.name)
    expect(picked).toEqual(runtime)
  })

  it("skips unknown ids and collapses duplicates", () => {
    const first = OFFER_CATALOG[0]!
    const offers = [
      { definitionId: first.definitionId },
      { definitionId: first.definitionId },
      { definitionId: "item-shops:does-not-exist" },
    ]
    expect(previewOfferSample(offers, { count: 2 }, seq([0.5]))).toEqual([first.name])
  })
})

describe("trip events", () => {
  const base = (): TripMapInput => {
    const { events: _sample, ...rest } = structuredClone(SAMPLE_TRIP_MAP)
    return rest
  }

  it("stamps every preset and round-trips through Copy JSON", () => {
    let draft = base()
    for (const preset of EVENT_PRESET_BUTTONS) draft = addEventFromPreset(draft, preset.id).draft
    expect(draft.events?.map((e) => e.id)).toEqual([
      "traffic-jam",
      "blown-tire",
      "engine-failure",
      "out-of-gas",
    ])
    expect(draft.events?.find((e) => e.id === "out-of-gas")?.mile).toBeUndefined()
    expect(draft.events?.find((e) => e.id === "traffic-jam")?.mile).toBe(6)
    expect(hasFuelEvent(draft)).toBe(true)

    draft = updateEvent(draft, "traffic-jam", {
      icon: "🐄",
      effect: { kind: "slow", factor: 0.2 },
      beats: [{ atMinutes: 2, narrative: "A cow stares at the van." }],
    })
    draft = moveEvent(draft, "traffic-jam", 3.04)
    const parsed = parseTripMap(JSON.parse(mapJson(draft)))
    expect(parsed.ok).toBe(true)
    expect(parsed.map?.events?.find((e) => e.id === "traffic-jam")).toMatchObject({
      icon: "🐄",
      mile: 3,
      effect: { kind: "slow", factor: 0.2 },
      beats: [{ atMinutes: 2, narrative: "A cow stares at the van." }],
    })
  })

  it("adds a blank narrative-only event that lints clean", () => {
    const first = addBlankEvent(base())
    const second = addBlankEvent(first.draft)
    expect([first.eventId, second.eventId]).toEqual(["event", "event-2"])
    const parsed = parseTripMap(JSON.parse(mapJson(second.draft)))
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(parsed.map?.events?.[0]).toMatchObject({ name: "Roadside event", mile: 6 })
    expect(parsed.map?.events?.[0]?.effect).toBeUndefined()
  })

  it("gives a second stamp of the same preset its own id", () => {
    const once = addEventFromPreset(base(), "blown-tire")
    const twice = addEventFromPreset(once.draft, "blown-tire")
    expect(twice.eventId).toBe("blown-tire-2")
    expect(removeEvent(twice.draft, "blown-tire-2").events?.map((e) => e.id)).toEqual([
      "blown-tire",
    ])
    expect(removeEvent(once.draft, "blown-tire").events).toBeUndefined()
  })

  it("clears a field patched to undefined", () => {
    const { draft } = addEventFromPreset(base(), "traffic-jam")
    expect(updateEvent(draft, "traffic-jam", { narrative: undefined }).events?.[0]).not.toHaveProperty(
      "narrative",
    )
  })

  it("prices an engine failure as a tow before the Mechanic and the shoulder after it", () => {
    let draft = addEventFromPreset(base(), "engine-failure").draft
    const purposes = (mile: number) => {
      const map = tripMapSchema.parse(moveEvent(draft, "engine-failure", mile))
      return estimateEvent(map, "engine-failure", 1)?.lines.map((l) => l.purpose)
    }
    expect(purposes(2)).toEqual(["tow", "repair"])
    expect(purposes(11)).toEqual(["repair"])
    draft = updateEvent(draft, "engine-failure", {
      resolution: [{ kind: "tow", towCost: 0, repairCost: 0 }],
    })
    expect(estimateEvent(tripMapSchema.parse(draft), "engine-failure", 1)?.total).toBe(0)
  })

  it("lifts a legacy scripted-event draft", () => {
    const { events: _sample, ...rest } = structuredClone(SAMPLE_TRIP_MAP)
    const legacy = { ...rest, scriptedEvents: [{ id: "jam-1", atMile: 5, incident: "traffic-jam" }] }
    expect(liftDraft(legacy).events).toEqual([
      expect.objectContaining({ id: "jam-1", presetId: "traffic-jam", mile: 5, name: "Traffic jam" }),
    ])
  })
})
